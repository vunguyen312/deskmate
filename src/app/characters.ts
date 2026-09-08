import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import type {
    CharacterInfo,
    CharacterSummary,
} from '../../shared/contract';
import { APP_DIR } from '../utils/paths';

export const CHARACTERS_DIR = path.join(APP_DIR, 'characters');

export const VOICES_FILE = 'voices.json';

export const CHARACTER_FILE = 'character.json';

const ICON_EXTENSIONS = [
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.avif',
    '.bmp',
];

export class CharacterRegistry {
    constructor(public readonly root: string = CHARACTERS_DIR) {}

    public list(): CharacterInfo[] {
        let entries;
        try {
            entries = readdirSync(this.root, { withFileTypes: true });
        } catch {
            return [];
        }
        const out: CharacterInfo[] = [];
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            const file = path.join(this.root, entry.name, CHARACTER_FILE);
            if (!existsSync(file)) {
                continue;
            }
            try {
                const data = JSON.parse(
                    readFileSync(file, 'utf8'),
                ) as Omit<CharacterInfo, 'id'>;
                if (typeof data !== 'object' || data === null) {
                    continue;
                }
                out.push({ ...data, id: entry.name });
            } catch (err) {
                console.warn(
                    `[voice-box] skipping malformed character ${entry.name}:`,
                    err,
                );
            }
        }
        return out;
    }

    public get(id: string): CharacterInfo | null {
        return this.list().find((c) => c.id === id) ?? null;
    }

    public resolveImage(id: string): string | null {
        let entries;
        try {
            entries = readdirSync(path.join(this.root, id));
        } catch {
            return null;
        }
        const icon = entries.find((file) => {
            const ext = path.extname(file).toLowerCase();
            const stem = path
                .basename(file, path.extname(file))
                .toLowerCase();
            return stem === 'icon' && ICON_EXTENSIONS.includes(ext);
        });
        if (!icon) {
            return null;
        }
        return `characters/${id}/${icon}`.replace(/\\/g, '/');
    }

    public voicesFile(character: CharacterInfo): string {
        return `characters/${character.id}/${VOICES_FILE}`;
    }

    public firstVoice(id: string): string | null {
        const file = path.join(this.root, id, VOICES_FILE);
        if (!existsSync(file)) {
            return null;
        }
        try {
            const data = JSON.parse(readFileSync(file, 'utf8')) as Record<
                string,
                unknown
            >;
            return Object.keys(data)[0] ?? null;
        } catch (err) {
            console.warn(
                `[voice-box] could not read voices for character ${id}:`,
                err,
            );
            return null;
        }
    }

    public summary(
        character: CharacterInfo,
        activeId: string,
    ): CharacterSummary {
        return {
            id: character.id,
            name: character.name || character.id,
            description: character.description,
            image: this.resolveImage(character.id) ?? undefined,
            active: character.id === activeId,
        };
    }
}
