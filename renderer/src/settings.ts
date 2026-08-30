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

type TabName = 'characters' | 'voice' | 'memory' | 'captions' | 'pet';
const tabButtons: Record<TabName, HTMLButtonElement> = {
    characters: document.getElementById(
        'tab-btn-characters',
    ) as HTMLButtonElement,
    voice: document.getElementById('tab-btn-voice') as HTMLButtonElement,
    memory: document.getElementById('tab-btn-memory') as HTMLButtonElement,
    captions: document.getElementById(
        'tab-btn-captions',
    ) as HTMLButtonElement,
    pet: document.getElementById('tab-btn-pet') as HTMLButtonElement,
};
const panels: Record<TabName, HTMLElement> = {
    characters: document.getElementById('panel-characters') as HTMLElement,
    voice: document.getElementById('panel-voice') as HTMLElement,
    memory: document.getElementById('panel-memory') as HTMLElement,
    captions: document.getElementById('panel-captions') as HTMLElement,
    pet: document.getElementById('panel-pet') as HTMLElement,
};
const characterListEl = document.getElementById('character-list') as HTMLDivElement;
const charactersStatusEl = document.getElementById('status-characters') as HTMLSpanElement;
const voiceStatusEl = document.getElementById('status-voice') as HTMLSpanElement;
const openFolderBtn = document.getElementById('open-folder') as HTMLButtonElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;
const maxTokensInput = document.getElementById('max-tokens') as HTMLInputElement;
const llmModelInput = document.getElementById('llm-model') as HTMLInputElement;
const llmTemperatureInput = document.getElementById(
    'llm-temperature',
) as HTMLInputElement;
const llmThinkInput = document.getElementById('llm-think') as HTMLInputElement;
const llmFreqPenaltyInput = document.getElementById(
    'llm-freq-penalty',
) as HTMLInputElement;
const llmPresencePenaltyInput = document.getElementById(
    'llm-presence-penalty',
) as HTMLInputElement;
const llmGpuLayersInput = document.getElementById(
    'llm-gpu-layers',
) as HTMLInputElement;
const capXInput = document.getElementById('cap-x') as HTMLInputElement;
const capYInput = document.getElementById('cap-y') as HTMLInputElement;
const capWidthInput = document.getElementById('cap-width') as HTMLInputElement;
const capHeightInput = document.getElementById('cap-height') as HTMLInputElement;
const capFontSizeInput = document.getElementById(
    'cap-font-size',
) as HTMLInputElement;
const capEnabledInput = document.getElementById(
    'cap-enabled',
) as HTMLInputElement;
const fillScreenBtn = document.getElementById('fill-screen') as HTMLButtonElement;
const petWidthInput = document.getElementById('pet-width') as HTMLInputElement;
const petHeightInput = document.getElementById('pet-height') as HTMLInputElement;

const memEnabledInput = document.getElementById('mem-enabled') as HTMLInputElement;
const memTopKInput = document.getElementById('mem-top-k') as HTMLInputElement;
const memMaxEntriesInput = document.getElementById(
    'mem-max-entries',
) as HTMLInputElement;
const memStatusEl = document.getElementById('status-memory') as HTMLSpanElement;
const memClearBtn = document.getElementById('mem-clear') as HTMLButtonElement;

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

function showTab(name: TabName): void {
    for (const key of Object.keys(tabButtons) as TabName[]) {
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
    llmModelInput.value = config.llm.model;
    llmTemperatureInput.value = String(config.llm.temperature);
    llmThinkInput.checked = config.llm.think ?? false;
    llmFreqPenaltyInput.value = String(config.llm.frequencyPenalty ?? 0);
    llmPresencePenaltyInput.value = String(config.llm.presencePenalty ?? 0);
    llmGpuLayersInput.value = String(config.llm.gpuLayers ?? 99);
    maxTokensInput.value = String(config.llm.maxTokens);
}

function refreshCaptionsSettings(config: AppConfig): void {
    const c = config.captions;
    capEnabledInput.checked = c.enabled;
    capXInput.value = String(c.x);
    capYInput.value = String(c.y);
    capWidthInput.value = String(c.width);
    capHeightInput.value = String(c.height);
    capFontSizeInput.value = String(c.fontSize);
}

function refreshPetSettings(config: AppConfig): void {
    petWidthInput.value = String(config.window.width);
    petHeightInput.value = String(config.window.height);
}

/**
 * Memory state for the active character, fetched from the main process.
 * While the embedding model is still loading (or after a failure) the
 * count line reflects readiness instead of a number.
 */
async function refreshMemoryStatus(enabled: boolean): Promise<void> {
    const status = await window.api.getMemoryStatus();
    if (!enabled) {
        showStatus(memStatusEl, 'Memory is off');
        return;
    }
    if (!status.ready) {
        showStatus(memStatusEl, 'Embedding model loading… (first use downloads ~23 MB)');
        return;
    }
    showStatus(
        memStatusEl,
        `${status.count} exchange${status.count === 1 ? '' : 's'} stored`,
    );
}

function refreshMemorySettings(config: AppConfig): void {
    memEnabledInput.checked = config.memory.enabled;
    memTopKInput.value = String(config.memory.topK);
    memMaxEntriesInput.value = String(config.memory.maxEntries);
    void refreshMemoryStatus(config.memory.enabled);
}

/** Parse an integer input and range-check it; throws with a UI-ready message. */
function readInt(
    el: HTMLInputElement,
    min: number,
    max: number,
    name: string,
): number {
    const value = Number(el.value);
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
}

/** Parse a decimal input and range-check it; throws with a UI-ready message. */
function readNumber(
    el: HTMLInputElement,
    min: number,
    max: number,
    name: string,
): number {
    const value = Number(el.value);
    if (!Number.isFinite(value) || value < min || value > max) {
        throw new Error(`${name} must be between ${min} and ${max}`);
    }
    return value;
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
        if (ch.image) {
            img.src = resolveImageSrc(ch.image);
        }
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
        showStatus(
            charactersStatusEl,
            result.ttsRestarting
                ? `Switched to ${ch.name} — restarting TTS…`
                : `Switched to ${ch.name}`,
        );
    } catch (err) {
        showStatus(charactersStatusEl, `Failed to switch: ${String(err)}`, true);
    }
}

async function main(): Promise<void> {
    const config = await window.api.getConfig();
    refreshVoiceSettings(config);
    refreshCaptionsSettings(config);
    refreshPetSettings(config);
    await renderCharacters();

    refreshMemorySettings(config);
    memClearBtn.addEventListener('click', async () => {
        memClearBtn.disabled = true;
        try {
            const status = await window.api.clearMemory();
            showStatus(
                memStatusEl,
                status.ready
                    ? 'Memory cleared'
                    : 'Memory cleared (model not loaded)',
            );
        } catch (err) {
            showStatus(memStatusEl, `Failed to clear: ${String(err)}`, true);
        } finally {
            memClearBtn.disabled = false;
        }
    });

    tabButtons.characters.addEventListener('click', () => {
        showTab('characters');
    });
    tabButtons.voice.addEventListener('click', () => {
        showTab('voice');
    });
    tabButtons.memory.addEventListener('click', () => {
        showTab('memory');
        void refreshMemoryStatus(memEnabledInput.checked);
    });
    tabButtons.captions.addEventListener('click', () => {
        showTab('captions');
    });
    tabButtons.pet.addEventListener('click', () => {
        showTab('pet');
    });

    openFolderBtn.addEventListener('click', () => {
        window.api.openCharactersFolder();
    });

    fillScreenBtn.addEventListener('click', async () => {
        fillScreenBtn.disabled = true;
        try {
            const area = await window.api.getWorkArea();
            capXInput.value = String(area.x);
            capYInput.value = String(area.y);
            capWidthInput.value = String(area.width);
            capHeightInput.value = String(area.height);
        } catch (err) {
            showStatus(
                voiceStatusEl,
                `Failed to fill screen: ${String(err)}`,
                true,
            );
        } finally {
            fillScreenBtn.disabled = false;
        }
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
            const llmModel = llmModelInput.value.trim();
            if (!llmModel) {
                throw new Error('LLM model must not be empty');
            }
            const result = await window.api.saveSettings({
                language: languageDropdown.current!,
                ttsModel: modelDropdown.current!,
                llm: {
                    model: llmModel,
                    maxTokens: readInt(maxTokensInput, 64, 131072, 'Max tokens'),
                    temperature: readNumber(
                        llmTemperatureInput,
                        0,
                        2,
                        'Temperature',
                    ),
                    think: llmThinkInput.checked,
                    frequencyPenalty: readNumber(
                        llmFreqPenaltyInput,
                        -2,
                        2,
                        'Frequency penalty',
                    ),
                    presencePenalty: readNumber(
                        llmPresencePenaltyInput,
                        -2,
                        2,
                        'Presence penalty',
                    ),
                    gpuLayers: readInt(llmGpuLayersInput, 0, 999, 'GPU layers'),
                },
                memory: {
                    enabled: memEnabledInput.checked,
                    topK: readInt(memTopKInput, 1, 20, 'Memories per reply'),
                    maxEntries: readInt(
                        memMaxEntriesInput,
                        1,
                        100000,
                        'Max stored exchanges',
                    ),
                },
                captions: {
                    enabled: capEnabledInput.checked,
                    x: readInt(capXInput, -99999, 99999, 'X'),
                    y: readInt(capYInput, -99999, 99999, 'Y'),
                    width: readInt(capWidthInput, 200, 9999, 'Width'),
                    height: readInt(capHeightInput, 100, 9999, 'Height'),
                    fontSize: readInt(
                        capFontSizeInput,
                        12,
                        400,
                        'Font size',
                    ),
                },
                petWindow: {
                    width: readInt(petWidthInput, 100, 4000, 'Width'),
                    height: readInt(petHeightInput, 100, 4000, 'Height'),
                },
            });
            void refreshMemoryStatus(memEnabledInput.checked);
            const restarted: string[] = [];
            if (result.ttsRestarting) {
                restarted.push('TTS');
            }
            if (result.llmRestarting) {
                restarted.push('LLM');
            }
            showStatus(
                voiceStatusEl,
                restarted.length > 0
                    ? `Saved — restarting ${restarted.join(' + ')}…`
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
