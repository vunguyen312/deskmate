import { spawn, type ChildProcess } from 'node:child_process';
import { errorMessage } from '../utils/errors';

const POLL_INTERVAL_MS = 2000;
export const PROBE_TIMEOUT_MS = 3000;
export const LOADING_WARNING_AFTER_MS = 10000;

export interface SpawnSpec {
    command: string;
    args: string[];
    env?: NodeJS.ProcessEnv;
}

export type ProbeState = 'up' | 'starting' | 'down';

export abstract class ChildService {
    protected child: ChildProcess | null = null;
    private pollTimer: NodeJS.Timeout | null = null;
    private polling = false;
    protected spawnAttempted = false;
    private warned = false;
    private settle!: () => void;
    private settledOnce = false;

    
    public readonly settled: Promise<void> = new Promise((resolve) => {
        this.settle = resolve;
    });

    constructor(
        protected readonly name: string,
        protected readonly cwd: string,
        protected readonly toast: (msg: string) => void,
        protected readonly spawnEnabled: boolean,
    ) {}

    
    protected abstract buildSpawn(): SpawnSpec | null;
    
    protected abstract probe(): Promise<ProbeState>;
    
    protected abstract manualStartMessage(): string;
    protected abstract spawnFailedMessage(err: Error): string;
    
    protected handleReady(): void {}
    protected warning(): { afterMs: number; message: string } | null {
        return null;
    }
    
    protected onSpawned(_child: ChildProcess): void {}

    public async ensureStarted(): Promise<void> {
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
        if (!this.spawnEnabled) {
            this.toast(this.manualStartMessage());
            this.markSettled();
            return;
        }
        const spec = this.buildSpawn();
        if (!spec) {
            this.markSettled();
            return;
        }
        this.spawn(spec);
        this.startPolling();
    }

    public stop(): void {
        this.stopPolling();
        this.child?.kill();
        this.child = null;
    }

    /**
     * Stop the service, wait for the port to actually free up (the old
     * process may take a moment to die), then start it again with the
     * current configuration. Used by settings changes that need a respawn.
     */
    public async restart(): Promise<void> {
        this.stop();
        for (let i = 0; i < 45; i++) {
            const state = await this.probe();
            if (state === 'down') {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        await this.ensureStarted();
    }

    private spawn(spec: SpawnSpec): void {
        this.spawnAttempted = true;
        let child: ChildProcess;
        try {
            child = spawn(spec.command, spec.args, {
                cwd: this.cwd,
                env: spec.env,
            });
        } catch (err) {
            this.toast(this.spawnFailedMessage(new Error(errorMessage(err))));
            this.markSettled();
            return;
        }
        this.child = child;
        if (child.stdout) {
            child.stdout.on('data', (d) => {
                console.log(`[${this.name}]`, String(d).trimEnd());
            });
        }
        if (child.stderr) {
            child.stderr.on('data', (d) => {
                console.error(`[${this.name}]`, String(d).trimEnd());
            });
        }
        child.on('error', (err) => {
            this.toast(this.spawnFailedMessage(err));
            this.markSettled();
        });
        child.on('exit', (code, sig) => {
            console.log(
                `[voice-box] ${this.name} process exited (${code ?? sig})`,
            );
            this.child = null;
        });
        this.onSpawned(child);
    }

    protected startPolling(): void {
        this.polling = true;
        this.schedulePoll(Date.now());
    }

    private schedulePoll(startedAt: number): void {
        this.pollTimer = setTimeout(() => {
            void this.pollOnce(startedAt);
        }, POLL_INTERVAL_MS);
    }

    
    
    
    private async pollOnce(startedAt: number): Promise<void> {
        if (!this.polling) {
            return; 
        }
        
        
        if (this.spawnAttempted && this.child === null) {
            this.stopPolling();
            this.markSettled();
            return;
        }
        const state = await this.probe();
        if (!this.polling) {
            return; 
        }
        if (state === 'up') {
            this.stopPolling();
            this.handleReady();
            this.markSettled();
            return;
        }
        const w = this.warning();
        if (w && !this.warned && Date.now() - startedAt > w.afterMs) {
            this.warned = true;
            this.toast(w.message);
        }
        this.schedulePoll(startedAt);
    }

    private stopPolling(): void {
        this.polling = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    
    protected markSettled(): void {
        if (this.settledOnce) {
            return;
        }
        this.settledOnce = true;
        this.settle();
    }
}