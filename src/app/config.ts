import { readFileSync } from 'node:fs';
import type { AppConfig } from '../../shared/contract';

export class Config {
    readonly data: AppConfig;

    constructor(filePath: string) {
        this.data = JSON.parse(readFileSync(filePath, 'utf8'));
    }
}