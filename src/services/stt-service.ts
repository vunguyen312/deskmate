import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SttConfig } from '../../shared/contract';
import { MODELS_DIR, VENDOR_DIR } from '../utils/paths';
import { servicePort } from '../utils/urls';
import {
    ChildService,
    LOADING_WARNING_AFTER_MS,
    PROBE_TIMEOUT_MS,
    type ProbeState,
    type SpawnSpec,
} from './child-service';

export const STT_DEFAULT_PORT = 8002;
const WHISPER_THREADS = 4;

export class SttService extends ChildService {
    private modelPath: string | null = null;

    constructor(
        private readonly config: SttConfig,
        private readonly onReady: () => void,
        toast: (msg: string) => void,
    ) {
        super('stt', MODELS_DIR, toast, true);
    }

    protected async probe(): Promise<ProbeState> {
        try {
            const url = `${this.config.url.replace(/\/$/, '')}/health`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
            });
            if (res.ok) {
                const data = (await res.json()) as { status?: unknown };
                if (data.status === 'ok') {
                    return 'up';
                }
                return 'starting';
            }
            if (res.status === 503) {
                return 'starting';
            }
            return 'down';
        } catch {
            return 'down';
        }
    }

    protected buildSpawn(): SpawnSpec | null {
        const bin = this.findWhisperServer();
        if (!bin) {
            this.toast(
                'whisper-server not found on PATH, ~/.local/bin, or voice-box/vendor/whisper/. Build whisper.cpp (github.com/ggml-org/whisper.cpp) or drop a prebuilt build into voice-box/vendor/whisper/.',
            );
            return null;
        }
        const model = this.ensureModel();
        if (!model) {
            return null;
        }
        const port = servicePort(this.config.url, STT_DEFAULT_PORT);
        const args = [
            '-m',
            model,
            '-l',
            this.config.language,
            '--host',
            '127.0.0.1',
            '--port',
            String(port),
            '-t',
            String(WHISPER_THREADS),
            '-nt',
        ];
        const env: NodeJS.ProcessEnv = { ...process.env };
        if (bin.startsWith(VENDOR_DIR)) {
            env.LD_LIBRARY_PATH = path
                .dirname(bin)
                .concat(env.LD_LIBRARY_PATH ? `:${env.LD_LIBRARY_PATH}` : '');
        }
        return { command: bin, args, env };
    }

    protected handleReady(): void {
        console.log('[voice-box] STT ready');
        this.onReady();
    }

    protected onSpawned(child: ChildProcess): void {
        const port = servicePort(this.config.url, STT_DEFAULT_PORT);
        console.log(
            `[voice-box] started whisper-server (pid ${child.pid}, port ${port})`,
        );
    }

    protected manualStartMessage(): string {
        const port = servicePort(this.config.url, STT_DEFAULT_PORT);
        const bin =
            this.findWhisperServer() ?? path.join('voice-box', 'vendor', 'whisper', 'whisper-server');
        const model =
            this.modelPath ?? path.join('voice-box', 'models', 'ggml-small.bin');
        return `STT server not running at ${this.config.url}. Start it: ${bin} -m ${model} --port ${port}`;
    }

    protected spawnFailedMessage(err: Error): string {
        return `Could not start whisper-server: ${err.message}. Build whisper.cpp with CUDA (github.com/ggml-org/whisper.cpp).`;
    }

    protected warning(): { afterMs: number; message: string } {
        return {
            afterMs: LOADING_WARNING_AFTER_MS,
            message: 'STT model loading…',
        };
    }

    private ensureModel(): string | null {
        const file = path.join(MODELS_DIR, `ggml-${this.config.model}.bin`);
        if (existsSync(file)) {
            this.modelPath = file;
            return file;
        }
        this.toast(
            `STT model not found — install ${path.join(
                'voice-box',
                'models',
                `ggml-${this.config.model}.bin`,
            )} (see README).`,
        );
        return null;
    }

    private findWhisperServer(): string | null {
        const candidates: string[] = [];
        for (const dir of (process.env.PATH || '').split(path.delimiter)) {
            if (dir) {
                candidates.push(path.join(dir, 'whisper-server'));
            }
        }
        candidates.push(
            path.join(os.homedir(), '.local', 'bin', 'whisper-server'),
            path.join(VENDOR_DIR, 'whisper', 'whisper-server'),
            path.join(VENDOR_DIR, 'whisper-server'),
        );
        for (const c of candidates) {
            try {
                if (existsSync(c)) {
                    return c;
                }
            } catch {
                // skip unreadable candidate
            }
        }
        return null;
    }
}
