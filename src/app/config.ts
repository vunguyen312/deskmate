import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { AppConfig } from '../../shared/contract';

export class Config {
    readonly data: AppConfig;
    private readonly filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
        this.data = JSON.parse(readFileSync(filePath, 'utf8')) as AppConfig;
    }

    /** Persist the in-memory config to disk (atomic write via temp + rename). */
    public save(): void {
        const tmp = `${this.filePath}.tmp`;
        writeFileSync(tmp, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
        renameSync(tmp, this.filePath);
    }
}
