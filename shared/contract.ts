
export type ServiceKind = 'stt' | 'llm' | 'tts';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LlmConfig {
    baseUrl: string;
    model: string;
    systemPrompt: string;
    maxTokens: number;
    temperature: number;
    think?: boolean;
    frequencyPenalty?: number;
    presencePenalty?: number;
    spawn: boolean;
    gpuLayers?: number;
}

export interface MemoryConfig {

    enabled: boolean;

    topK: number;

    maxEntries: number;
}

export interface MemoryStatus {

    ready: boolean;

    count: number;
}

export interface SttConfig {
    url: string;
    model: string;
    language: string;
}

export interface TtsConfig {
    url: string;
    voice: string;

    voicesFile: string;
    responseFormat: 'pcm' | 'wav';
    sampleRate: number;
    spawn: boolean;

    language: string;

    model: string;
}

export interface LanguageOption {
    label: string;

    stt: string;

    tts: string;
}

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
    { label: 'Japanese', stt: 'ja', tts: 'Japanese' },
    { label: 'English', stt: 'en', tts: 'English' },
    { label: 'Chinese', stt: 'zh', tts: 'Chinese' },
    { label: 'French', stt: 'fr', tts: 'French' },
    { label: 'German', stt: 'de', tts: 'German' },
    { label: 'Spanish', stt: 'es', tts: 'Spanish' },
    { label: 'Auto', stt: 'auto', tts: 'Auto' },
];

export interface TtsModelOption {
    id: string;
    label: string;
}

export const TTS_MODEL_OPTIONS: readonly TtsModelOption[] = [
    {
        id: 'Qwen/Qwen3-TTS-12Hz-1.7B-Base',
        label: 'Qwen3-TTS 1.7B',
    },
    {
        id: 'Qwen/Qwen3-TTS-12Hz-0.6B-Base',
        label: 'Qwen3-TTS 0.6B',
    },
];

export interface CharacterInfo {

    id: string;

    name: string;
    description?: string;
    systemPrompt?: string;
}

export interface LlmSettingsPatch {
    model: string;
    maxTokens: number;
    temperature: number;
    think: boolean;
    frequencyPenalty: number;
    presencePenalty: number;
    gpuLayers: number;
}

export interface SettingsPatch {

    language: string;

    ttsModel: string;

    llm: LlmSettingsPatch;

    memory: MemoryConfig;

    captions: CaptionWindowConfig;

    petWindow: WindowConfig;
}

export interface SaveSettingsResult {
    ok: true;

    ttsRestarting: boolean;

    llmRestarting: boolean;
}

export interface CharacterSummary {
    id: string;
    name: string;
    description?: string;

    image?: string;
    active: boolean;
}

export interface SelectCharacterResult {
    ok: true;

    ttsRestarting: boolean;
}

export interface VadConfig {
    threshold: number;
    minSilenceFrames: number;
}

export interface WindowConfig {
    width: number;
    height: number;
}

export interface WindowRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CaptionWindowConfig extends WindowRect {
    fontSize: number;

    enabled: boolean;
}

export interface DebugConfig {
    autoSendWav: string;
}

export interface AppConfig {

    character: string;
    llm: LlmConfig;
    memory: MemoryConfig;
    stt: SttConfig;
    tts: TtsConfig;
    vad: VadConfig;

    image?: string;
    window: WindowConfig;
    captions: CaptionWindowConfig;
    debug: DebugConfig;
}

export const CHANNELS = {
    getConfig: 'get-config',
    speechAudio: 'speech-audio',
    speechStart: 'speech-start',
    ttsStart: 'tts-start',
    sttText: 'stt-text',
    llmText: 'llm-text',
    ttsChunk: 'tts-chunk',
    ttsEnd: 'tts-end',
    toast: 'toast',
    windowDragStart: 'window-drag-start',
    windowDragMoveTo: 'window-drag-move-to',
    windowDragEnd: 'window-drag-end',
    getWindowPosition: 'window-get-position',
    quit: 'quit',
    appReady: 'app-ready',
    appReadyQuery: 'app-ready-query',
    openSettings: 'open-settings',
    saveSettings: 'save-settings',
    captionsConfig: 'captions-config',
    getWorkArea: 'get-work-area',
    openCharactersFolder: 'open-characters-folder',
    listCharacters: 'list-characters',
    selectCharacter: 'select-character',
    avatarChanged: 'avatar-changed',
    getMemoryStatus: 'get-memory-status',
    clearMemory: 'clear-memory',
} as const;

export interface VoiceBoxApi {
    getConfig(): Promise<AppConfig>;
    sendSpeech(audio: Float32Array): void;

    onSpeechStart(cb: () => void): void;
    onSttText(cb: (text: string) => void): void;
    onLlmText(cb: (text: string) => void): void;
    onTtsChunk(cb: (buf: ArrayBuffer) => void): void;

    onTtsStart(cb: () => void): void;
    onTtsEnd(cb: () => void): void;

    onCaptionsConfig(cb: (cfg: CaptionWindowConfig) => void): void;
    onToast(cb: (msg: string) => void): void;
    windowDragStart(): void;

    windowDragMoveTo(x: number, y: number): void;
    windowDragEnd(): void;

    getWindowPosition(): Promise<{ x: number; y: number }>;
    quit(): void;
    onAppReady(cb: () => void): void;
    isAppReady(): Promise<boolean>;
    openSettings(): void;
    openCharactersFolder(): void;

    getWorkArea(): Promise<WindowRect>;
    saveSettings(patch: SettingsPatch): Promise<SaveSettingsResult>;
    listCharacters(): Promise<CharacterSummary[]>;
    selectCharacter(id: string): Promise<SelectCharacterResult>;
    onAvatarChanged(cb: (image: string) => void): void;

    getMemoryStatus(): Promise<MemoryStatus>;

    clearMemory(): Promise<MemoryStatus>;
}
