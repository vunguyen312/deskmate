import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { env, pipeline } from '@xenova/transformers';
import type { FeatureExtractionPipeline } from '@xenova/transformers';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { Document } from '@langchain/core/documents';
import { VectorStoreRetrieverMemory } from '@langchain/classic/memory';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import type { MemoryConfig, MemoryStatus } from '../../shared/contract';
import { APP_DIR, MODELS_DIR } from '../utils/paths';
import { errorMessage } from '../utils/errors';

/**
 * Long-term memory backed by a local vector store (LangChain
 * `MemoryVectorStore` + `VectorStoreRetrieverMemory`), persisted as one JSON
 * file per character under `memory/`. Utterances are embedded on-device with
 * transformers.js (MiniLM), so nothing leaves the machine.
 */
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const SAVE_DEBOUNCE_MS = 500;

interface MemoryFile {
    version: number;
    model: string;
    entries: Array<{
        content: string;
        embedding: number[];
        metadata?: Record<string, unknown>;
    }>;
}

/** Local embeddings over the transformers.js feature-extraction pipeline. */
class MiniLmEmbeddings implements EmbeddingsInterface {
    constructor(private readonly pipe: FeatureExtractionPipeline) {}

    public async embedDocuments(documents: string[]): Promise<number[][]> {
        const output = await this.pipe(documents, {
            pooling: 'mean',
            normalize: true,
        });
        return output.tolist() as number[][];
    }

    public async embedQuery(document: string): Promise<number[]> {
        const [vector] = await this.embedDocuments([document]);
        return vector;
    }
}

export class MemoryService {
    private readonly memoryKey = 'history';
    private pipe: FeatureExtractionPipeline | null = null;
    private embeddings: MiniLmEmbeddings | null = null;
    private store: MemoryVectorStore | null = null;
    private memory: VectorStoreRetrieverMemory | null = null;
    private ready = false;
    private failed = false;
    private initPromise: Promise<void> | null = null;
    private filePath: string;
    private saveTimer: ReturnType<typeof setTimeout> | undefined = undefined;
    private dirty = false;
    /** The exchange saved most recently; excluded from retrieval so the
     * previous turn (already in short-term history) is not echoed back. */
    private lastSavedText: string | null = null;

    constructor(
        private config: MemoryConfig,
        characterId: string,
        private readonly toast: (msg: string) => void,
    ) {
        this.filePath = path.join(APP_DIR, 'memory', `${characterId}.json`);
    }

    /** Kick off model load + store restore; never blocks startup. */
    public start(): void {
        this.initPromise = this.initSafe();
    }

    /** Apply settings changes (enabled/topK/maxEntries) without restart. */
    public applyConfig(config: MemoryConfig): void {
        const wasEnabled = this.config.enabled;
        const prevTopK = this.config.topK;
        this.config = config;
        if (config.enabled && !wasEnabled && !this.ready && !this.failed) {
            this.start();
        } else if (
            this.ready &&
            this.store &&
            config.topK !== prevTopK
        ) {
            this.memory = new VectorStoreRetrieverMemory({
                vectorStoreRetriever: this.store.asRetriever(config.topK),
                memoryKey: this.memoryKey,
                returnDocs: true,
            });
        }
    }

    /** Point memory at another character's store (character switch). */
    public switchCharacter(characterId: string): void {
        this.flush();
        this.filePath = path.join(APP_DIR, 'memory', `${characterId}.json`);
        this.ready = false;
        this.lastSavedText = null;
        this.initPromise = this.initSafe();
    }

    /**
     * Relevant past exchanges for `input`, as plain text (`input: …` /
     * `output: …` lines), or null when memory is off or nothing matches.
     */
    public async load(input: string): Promise<string | null> {
        if (!this.config.enabled || !(await this.ensureReady())) {
            return null;
        }
        try {
            const vars = await this.memory!.loadMemoryVariables({ input });
            const docs = vars[this.memoryKey] as Document[];
            const texts = docs
                .map((d) => d.pageContent)
                .filter((t) => t !== this.lastSavedText);
            return texts.length > 0 ? texts.join('\n\n') : null;
        } catch (err) {
            this.fail(`memory lookup failed: ${errorMessage(err)}`);
            return null;
        }
    }

    /** Store one exchange (`input` / `output`) for later retrieval. */
    public async save(input: string, output: string): Promise<void> {
        if (!this.config.enabled || !(await this.ensureReady())) {
            return;
        }
        try {
            await this.memory!.saveContext({ input }, { output });
            this.lastSavedText = `input: ${input}\noutput: ${output}`;
            if (this.store!.memoryVectors.length > this.config.maxEntries) {
                this.store!.memoryVectors = this.store!.memoryVectors.slice(
                    -this.config.maxEntries,
                );
            }
            this.dirty = true;
            this.schedulePersist();
        } catch (err) {
            this.fail(`memory save failed: ${errorMessage(err)}`);
        }
    }

    /** Delete all stored memories for the active character. */
    public clear(): void {
        if (this.store) {
            this.store.memoryVectors = [];
        }
        this.lastSavedText = null;
        this.dirty = false;
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        try {
            rmSync(this.filePath, { force: true });
        } catch (err) {
            console.error('[voice-box] memory clear:', err);
        }
    }

    public status(): MemoryStatus {
        return {
            ready: this.ready,
            count: this.store?.memoryVectors.length ?? 0,
        };
    }

    private async ensureReady(): Promise<boolean> {
        if (this.ready) {
            return true;
        }
        if (this.failed || !this.initPromise) {
            return false;
        }
        await this.initPromise;
        return this.ready;
    }

    private async initSafe(): Promise<void> {
        try {
            await this.init();
        } catch (err) {
            this.failed = true;
            console.error('[voice-box] memory disabled:', err);
            this.toast(`Memory disabled: ${errorMessage(err)}`);
        }
    }

    private async init(): Promise<void> {
        if (!this.config.enabled) {
            return;
        }
        if (!this.pipe) {
            // Keep the one-time MiniLM download out of node_modules so it
            // survives reinstalls (models/ is gitignored).
            env.cacheDir = path.join(MODELS_DIR, 'embeddings');
            this.pipe = await pipeline('feature-extraction', EMBEDDING_MODEL);
            this.embeddings = new MiniLmEmbeddings(this.pipe);
        }
        await this.loadStore();
        this.ready = true;
        console.log(
            `[voice-box] memory ready (${this.store?.memoryVectors.length ?? 0} stored)`,
        );
    }

    private async loadStore(): Promise<void> {
        const store = new MemoryVectorStore(this.embeddings!);
        if (existsSync(this.filePath)) {
            try {
                const data = JSON.parse(
                    readFileSync(this.filePath, 'utf8'),
                ) as MemoryFile;
                const entries = Array.isArray(data.entries) ? data.entries : [];
                if (entries.length > 0) {
                    await store.addVectors(
                        entries.map((e) => e.embedding),
                        entries.map(
                            (e) =>
                                new Document({
                                    pageContent: e.content,
                                    metadata: e.metadata ?? {},
                                }),
                        ),
                    );
                }
            } catch (err) {
                console.error(
                    `[voice-box] ignoring unreadable memory file ${this.filePath}:`,
                    err,
                );
            }
        }
        this.store = store;
        this.memory = new VectorStoreRetrieverMemory({
            vectorStoreRetriever: store.asRetriever(this.config.topK),
            memoryKey: this.memoryKey,
            returnDocs: true,
        });
    }

    private schedulePersist(): void {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.saveTimer = undefined;
            this.persist();
        }, SAVE_DEBOUNCE_MS);
    }

    private flush(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        this.persist();
    }

    private persist(): void {
        if (!this.dirty || !this.store) {
            return;
        }
        this.dirty = false;
        try {
            const file: MemoryFile = {
                version: 1,
                model: EMBEDDING_MODEL,
                entries: this.store.memoryVectors.map((v) => ({
                    content: v.content,
                    embedding: v.embedding,
                    metadata:
                        v.metadata && Object.keys(v.metadata).length > 0
                            ? v.metadata
                            : undefined,
                })),
            };
            mkdirSync(path.dirname(this.filePath), { recursive: true });
            const tmp = `${this.filePath}.tmp`;
            writeFileSync(
                tmp,
                `${JSON.stringify(file, null, 2)}\n`,
                'utf8',
            );
            renameSync(tmp, this.filePath);
        } catch (err) {
            console.error('[voice-box] memory persist:', err);
        }
    }

    private fail(message: string): void {
        if (!this.failed) {
            this.failed = true;
            console.error(`[voice-box] ${message}`);
            this.toast('Memory disabled for this session');
        }
    }
}
