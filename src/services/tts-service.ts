import type { ChildProcess } from 'node:child_process';
import type { TtsConfig } from '../../shared/contract';
import { PYTHON_ROOT, VENV_PYTHON } from '../utils/paths';
import { servicePort } from '../utils/urls';
import {
    ChildService,
    LOADING_WARNING_AFTER_MS,
    PROBE_TIMEOUT_MS,
    type ProbeState,
    type SpawnSpec,
} from './child-service';

export const TTS_DEFAULT_PORT = 8001;

export class TtsService extends ChildService {
    constructor(
        private readonly config: TtsConfig,
        toast: (msg: string) => void,
    ) {
        super('tts', PYTHON_ROOT, toast, config.spawn);
    }

    protected async probe(): Promise<ProbeState> {
        try {
            const url = `${this.config.url.replace(/\/$/, '')}/health`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
            });
            if (res.ok) {
                const data = (await res.json()) as { model_loaded?: unknown };
                if (data.model_loaded) {
                    return 'up';
                }
                return 'starting';
            }
            return 'down';
        } catch {
            return 'down';
        }
    }

    protected buildSpawn(): SpawnSpec {
        const port = servicePort(this.config.url, TTS_DEFAULT_PORT);
        return {
            command: VENV_PYTHON,
            args: [
                'server/openai_server.py',
                '--voices',
                'momo/voices.json',
                '--language',
                'Japanese',
                '--port',
                String(port),
            ],
        };
    }

    protected handleReady(): void {
        
        
        if (this.spawnAttempted) {
            console.log('[voice-box] TTS ready');
        } else {
            console.log('[voice-box] TTS server healthy');
        }
    }

    protected onSpawned(child: ChildProcess): void {
        const port = servicePort(this.config.url, TTS_DEFAULT_PORT);
        console.log(
            `[voice-box] started TTS server (pid ${child.pid}, port ${port})`,
        );
    }

    protected manualStartMessage(): string {
        return `TTS server not running at ${this.config.url} (auto-spawn disabled). Start it: python server/openai_server.py --voices momo/voices.json --language Japanese --port ${TTS_DEFAULT_PORT}`;
    }

    protected spawnFailedMessage(err: Error): string {
        return `Could not start TTS server: ${err.message}. Set up the repo venv (${VENV_PYTHON}).`;
    }

    protected warning(): { afterMs: number; message: string } {
        return {
            afterMs: LOADING_WARNING_AFTER_MS,
            message: 'TTS server loading… (first run can take ~60s)',
        };
    }
}