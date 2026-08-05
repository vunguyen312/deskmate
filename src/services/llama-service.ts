import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { LlmConfig } from '../../shared/contract';
import { MODELS_DIR, VENDOR_DIR } from '../utils/paths';
import { baseUrlHost, isLocalHost, servicePort } from '../utils/urls';
import {
    ChildService,
    LOADING_WARNING_AFTER_MS,
    PROBE_TIMEOUT_MS,
    type ProbeState,
    type SpawnSpec,
} from './child-service';

export const LLAMA_DEFAULT_PORT = 8081;
const CONTEXT_SIZE = 8192; 

interface ModelRef {
    repo: string;
    quant: string;
}

function parseModelRef(model: string): ModelRef {
    const i = model.lastIndexOf(':');
    if (i === -1) {
        return { repo: model, quant: 'Q4_K_S' };
    }
    return { repo: model.slice(0, i), quant: model.slice(i + 1) };
}

export class LlamaService extends ChildService {
    private modelPath: string | null = null;

    constructor(
        private readonly config: LlmConfig,
        toast: (msg: string) => void,
    ) {
        super('llama', MODELS_DIR, toast, config.spawn);
    }

    public override async ensureStarted(): Promise<void> {
        if (!this.spawnEnabled) {
            this.markSettled();
            return;
        }
        if (!isLocalHost(baseUrlHost(this.config.baseUrl))) {
            console.log(
                '[voice-box] llm.baseUrl is not local; not managing llama-server',
            );
            this.markSettled();
            return;
        }
        

        

        const state = await this.probe();
        if (state === 'up') {
            this.handleReady();
            this.markSettled();
            return;
        }
        if (state === 'starting') {
            this.startPolling();
            return;
        }
        if (!(await this.ensureModel())) {
            this.markSettled();
            return;
        }
        await super.ensureStarted();
    }

    protected async probe(): Promise<ProbeState> {
        try {
            const url = `${this.config.baseUrl.replace(/\/$/, '')}/health`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
            });
            if (res.ok) {
                const data = (await res.json()) as { status?: unknown };
                if (data.status === 'ok') {
                    return 'up';
                }
            }
            
            
            return 'starting';
        } catch {
            return 'down';
        }
    }

    protected buildSpawn(): SpawnSpec | null {
        const bin = this.findLlamaServer();
        if (!bin) {
            this.toast(
                'llama-server not found on PATH, ~/.local/bin, or voice-box/vendor/llama/. Install llama.cpp (github.com/ggml-org/llama.cpp) or drop a prebuilt build into voice-box/vendor/llama/.',
            );
            return null;
        }
        const port = servicePort(this.config.baseUrl, LLAMA_DEFAULT_PORT);
        const args = [
            '-m',
            this.modelPath!,
            '--host',
            '127.0.0.1',
            '--port',
            String(port),
            '-c',
            String(CONTEXT_SIZE),
            '-np',
            '1',
            '-ngl',
            String(this.config.gpuLayers ?? 99),
            '--alias',
            this.config.model,
            '--no-ui',
        ];
        
        const env: NodeJS.ProcessEnv = { ...process.env };
        if (bin.startsWith(VENDOR_DIR)) {
            const libDir = path.dirname(bin);
            env.LD_LIBRARY_PATH = libDir
                .concat(env.LD_LIBRARY_PATH ? `:${env.LD_LIBRARY_PATH}` : '');
        }
        return { command: bin, args, env };
    }

    protected handleReady(): void {
        console.log('[voice-box] llama ready, model present');
    }

    protected onSpawned(child: ChildProcess): void {
        const port = servicePort(this.config.baseUrl, LLAMA_DEFAULT_PORT);
        console.log(
            `[voice-box] started llama-server (pid ${child.pid}, port ${port})`,
        );
    }

    protected manualStartMessage(): string {
        const port = servicePort(this.config.baseUrl, LLAMA_DEFAULT_PORT);
        const ref = parseModelRef(this.config.model);
        const baseName = (ref.repo.split('/').pop() ?? '').replace(
            /-GGUF$/,
            '',
        );
        const file =
            this.modelPath ??
            path.join('voice-box', 'models', `${baseName}-${ref.quant}.gguf`);
        return `LLM server not running at ${this.config.baseUrl} (auto-spawn disabled). Start it: llama-server -m ${file} --port ${port}`;
    }

    protected spawnFailedMessage(err: Error): string {
        return `Could not start llama-server: ${err.message}. Install llama.cpp (github.com/ggml-org/llama.cpp).`;
    }

    protected warning(): { afterMs: number; message: string } {
        return {
            afterMs: LOADING_WARNING_AFTER_MS,
            message: 'LLM model loading…',
        };
    }

    
    private async ensureModel(): Promise<boolean> {
        const ref = parseModelRef(this.config.model);
        const baseName = (ref.repo.split('/').pop() ?? '').replace(/-GGUF$/, '');
        const conventional = `${baseName}-${ref.quant}.gguf`;
        const conventionalDest = path.join(MODELS_DIR, conventional);
        if (existsSync(conventionalDest)) {
            this.modelPath = conventionalDest;
            return true;
        }
        this.toast(
            `LLM model not found — install ${path.join(
                'voice-box',
                'models',
                conventional,
            )} (see README).`,
        );
        return false;
    }

    private findLlamaServer(): string | null {
        const candidates: string[] = [];
        for (const dir of (process.env.PATH || '').split(path.delimiter)) {
            if (dir) {
                candidates.push(path.join(dir, 'llama-server'));
            }
        }
        candidates.push(
            path.join(os.homedir(), '.local', 'bin', 'llama-server'),
            path.join(VENDOR_DIR, 'llama', 'llama-server'),
            path.join(VENDOR_DIR, 'llama-server'),
        );
        for (const c of candidates) {
            try {
                if (existsSync(c)) {
                    return c;
                }
            } catch {
                
            }
        }
        return null;
    }
}