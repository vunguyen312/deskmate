import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import type {
    CharacterInfo,
    CharacterSummary,
} from '../../shared/contract';
import { APP_DIR } from '../utils/paths';

export const CHARACTERS_DIR = path.join(APP_DIR, 'characters');

/** Voices file name every character folder must carry (consumed by the TTS server). */
export const VOICES_FILE = 'voices.json';
/** Character metadata file name. */
export const CHARACTER_FILE = 'character.json';

export class CharacterRegistry {
    constructor(public readonly root: string = CHARACTERS_DIR) {}

    /** All characters found under characters/, in directory order. */
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

    /**
     * Resolve a character's avatar to an app-relative path (or pass through
     * http(s) URLs). The static server serves from the app dir, so a
     * character-folder-relative image becomes `characters/<id>/<image>`.
     */
    public resolveImage(character: CharacterInfo): string {
        const image = character.image;
        if (!image || /^(https?:)?\//.test(image)) {
            return image;
        }
        return `characters/${character.id}/${image}`.replace(/\\/g, '/');
    }

    /** The character's voices.json, relative to the app dir. */
    public voicesFile(character: CharacterInfo): string {
        return `characters/${character.id}/${VOICES_FILE}`;
    }

    /**
     * The voice the TTS server will use for this character: the first voice
     * declared in the folder's voices.json (the server treats it as the
     * default too). Null when the file is missing or unreadable.
     */
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
            image: this.resolveImage(character),
            active: character.id === activeId,
        };
    }
}
