import {
    LANGUAGE_OPTIONS,
    TTS_MODEL_OPTIONS,
    type AppConfig,
    type CharacterSummary,
    type VoiceBoxApi,
} from '../../shared/contract';
import { Dropdown } from './dropdown';

declare global {
    interface Window {
        api: VoiceBoxApi;
    }
}

const tabButtons: Record<'characters' | 'voice', HTMLButtonElement> = {
    characters: document.getElementById('tab-btn-characters') as HTMLButtonElement,
    voice: document.getElementById('tab-btn-voice') as HTMLButtonElement,
};
const panels: Record<'characters' | 'voice', HTMLElement> = {
    characters: document.getElementById('panel-characters') as HTMLElement,
    voice: document.getElementById('panel-voice') as HTMLElement,
};
const characterListEl = document.getElementById('character-list') as HTMLDivElement;
const charactersStatusEl = document.getElementById('status-characters') as HTMLSpanElement;
const voiceStatusEl = document.getElementById('status-voice') as HTMLSpanElement;
const openFolderBtn = document.getElementById('open-folder') as HTMLButtonElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;

const languageDropdown = new Dropdown<string>(() => {});
const modelDropdown = new Dropdown<string>(() => {});
document.getElementById('language-dd')!.append(languageDropdown.element);
document.getElementById('tts-model-dd')!.append(modelDropdown.element);

function resolveImageSrc(image: string): string {
    if (image.startsWith('http')) {
        return image;
    }
    return new URL(image, location.origin).href;
}

function showTab(name: 'characters' | 'voice'): void {
    for (const key of Object.keys(tabButtons) as Array<'characters' | 'voice'>) {
        const active = key === name;
        tabButtons[key].classList.toggle('active', active);
        panels[key].classList.toggle('hidden', !active);
    }
}

function showStatus(el: HTMLSpanElement, message: string, error = false): void {
    el.textContent = message;
    el.classList.toggle('error', error);
}

function refreshVoiceSettings(config: AppConfig): void {
    // The stored language may predate the option list; fall back to the
    // TTS-side name, then to the first option.
    const storedLang =
        LANGUAGE_OPTIONS.find((o) => o.stt === config.stt.language) ??
        LANGUAGE_OPTIONS.find((o) => o.tts === config.tts.language) ??
        LANGUAGE_OPTIONS[0];
    languageDropdown.setOptions(
        LANGUAGE_OPTIONS.map((o) => ({ value: o.stt, label: o.label })),
        storedLang.stt,
    );
    const storedModel =
        TTS_MODEL_OPTIONS.find((m) => m.id === config.tts.model) ??
        TTS_MODEL_OPTIONS[0];
    modelDropdown.setOptions(
        TTS_MODEL_OPTIONS.map((m) => ({ value: m.id, label: m.label })),
        storedModel.id,
    );
}

async function renderCharacters(): Promise<void> {
    const list = await window.api.listCharacters();
    characterListEl.replaceChildren();
    for (const ch of list) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'character-card';
        card.classList.toggle('active', ch.active);
        card.title = ch.active ? `${ch.name} (active)` : `Switch to ${ch.name}`;

        const img = document.createElement('img');
        img.src = resolveImageSrc(ch.image);
        img.alt = '';

        const info = document.createElement('div');
        info.className = 'character-info';
        const name = document.createElement('span');
        name.className = 'character-name';
        name.textContent = ch.name;
        const desc = document.createElement('span');
        desc.className = 'character-desc';
        desc.textContent = ch.description ?? '';
        info.append(name, desc);

        card.append(img, info);
        card.addEventListener('click', () => {
            void selectCharacter(ch);
        });
        characterListEl.append(card);
    }
}

async function selectCharacter(ch: CharacterSummary): Promise<void> {
    if (ch.active) {
        return;
    }
    showStatus(charactersStatusEl, '');
    try {
        const result = await window.api.selectCharacter(ch.id);
        await renderCharacters();
        const restarted: string[] = [];
        if (result.ttsRestarting) {
            restarted.push('TTS');
        }
        if (result.llmRestarting) {
            restarted.push('LLM');
        }
        showStatus(
            charactersStatusEl,
            restarted.length > 0
                ? `Switched to ${ch.name} — restarting ${restarted.join(' + ')}…`
                : `Switched to ${ch.name}`,
        );
    } catch (err) {
        showStatus(charactersStatusEl, `Failed to switch: ${String(err)}`, true);
    }
}

async function main(): Promise<void> {
    const config = await window.api.getConfig();
    refreshVoiceSettings(config);
    await renderCharacters();

    tabButtons.characters.addEventListener('click', () => {
        showTab('characters');
    });
    tabButtons.voice.addEventListener('click', () => {
        showTab('voice');
    });

    openFolderBtn.addEventListener('click', () => {
        window.api.openCharactersFolder();
    });

    // Re-list after the user drops a character folder in the file manager
    // and comes back to this window.
    window.addEventListener('focus', () => {
        void renderCharacters();
    });

    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        showStatus(voiceStatusEl, '');
        try {
            const result = await window.api.saveSettings({
                language: languageDropdown.current!,
                ttsModel: modelDropdown.current!,
            });
            showStatus(
                voiceStatusEl,
                result.ttsRestarting
                    ? 'Saved — restarting TTS model…'
                    : 'Saved',
            );
        } catch (err) {
            showStatus(
                voiceStatusEl,
                `Failed to save: ${String(err)}`,
                true,
            );
        } finally {
            saveBtn.disabled = false;
        }
    });
}

void main().catch((err) => {
    console.error('[settings] init failed:', err);
});
