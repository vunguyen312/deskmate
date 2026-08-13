

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

export interface SttConfig {
    url: string;
    model: string;
    language: string;
}

export interface TtsConfig {
    url: string;
    voice: string;
    /** Path (relative to the app dir) to the character's voices.json, used when spawning the TTS server. */
    voicesFile: string;
    responseFormat: 'pcm' | 'wav';
    sampleRate: number;
    spawn: boolean;
    /** Language name passed to the TTS server, e.g. 'Japanese'. */
    language: string;
    /** HuggingFace model id used when spawning the TTS server. */
    model: string;
}

/** One entry of the shared TTS/STT language selector. */
export interface LanguageOption {
    label: string;
    /** whisper.cpp language code (also the config id), e.g. 'ja'. */
    stt: string;
    /** Qwen3-TTS language name, e.g. 'Japanese'. */
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

/**
 * A character folder (`characters/<id>/`): persona and voice only.
 * The avatar is the folder's `icon` image file, the TTS voice is whatever the
 * folder's `voices.json` declares (first voice wins). LLM settings, language,
 * and the TTS model are app-level settings in `config.json` and are never
 * touched by a character.
 */
export interface CharacterInfo {
    /** Folder name under characters/. */
    id: string;
    /** Display name for the settings UI. */
    name: string;
    description?: string;
    systemPrompt?: string;
}

/** App-level LLM knobs edited in Settings → Voice & LLM; every character shares them. */
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
    /** STT language code from LANGUAGE_OPTIONS, e.g. 'ja'. */
    language: string;
    /** HF model id from TTS_MODEL_OPTIONS. */
    ttsModel: string;
    /** LLM model + generation knobs. */
    llm: LlmSettingsPatch;
    /** Captions window geometry + font size. */
    captions: CaptionWindowConfig;
    /** Pet window dimensions. */
    petWindow: WindowConfig;
}

export interface SaveSettingsResult {
    ok: true;
    /** True when the TTS server was restarted for a model change. */
    ttsRestarting: boolean;
    /** True when llama-server was restarted (model or GPU-layers change). */
    llmRestarting: boolean;
}

/** Character as shown in the settings tab. */
export interface CharacterSummary {
    id: string;
    name: string;
    description?: string;
    /** App-relative path to the folder's icon file, when present. */
    image?: string;
    active: boolean;
}

export interface SelectCharacterResult {
    ok: true;
    /** True when the TTS server was restarted (voice change). */
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

/** Screen-space rectangle (CSS px, display coordinates). */
export interface WindowRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The standalone subtitles window: a transparent, always-on-top, click-through
 * surface that can span the whole screen. Geometry is in display coordinates;
 * the renderer reads `fontSize` for the caption text size.
 */
export interface CaptionWindowConfig extends WindowRect {
    fontSize: number;
    /** Whether the subtitles window is shown at all (Settings → Captions). */
    enabled: boolean;
}

export interface DebugConfig {
    autoSendWav: string;
}

export interface AppConfig {
    /** Active character id (a folder under characters/). */
    character: string;
    llm: LlmConfig;
    stt: SttConfig;
    tts: TtsConfig;
    vad: VadConfig;
    /** Avatar of the active character (`characters/<id>/icon.<ext>`), when present. */
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
} as const;

export interface VoiceBoxApi {
    getConfig(): Promise<AppConfig>;
    sendSpeech(audio: Float32Array): void;
    /** Fired when an utterance enters the pipeline (waiting indicator). */
    onSpeechStart(cb: () => void): void;
    onSttText(cb: (text: string) => void): void;
    onLlmText(cb: (text: string) => void): void;
    onTtsChunk(cb: (buf: ArrayBuffer) => void): void;
    /** Fired when reply audio starts streaming (waiting indicator off). */
    onTtsStart(cb: () => void): void;
    onTtsEnd(cb: () => void): void;
    /** Captions window geometry + font size after a settings save. */
    onCaptionsConfig(cb: (cfg: CaptionWindowConfig) => void): void;
    onToast(cb: (msg: string) => void): void;
    windowDragStart(): void;
    /** Move the pet window to an absolute screen position (DIP). */
    windowDragMoveTo(x: number, y: number): void;
    windowDragEnd(): void;
    /** Pet window position (DIP), used to anchor a drag at pointerdown. */
    getWindowPosition(): Promise<{ x: number; y: number }>;
    quit(): void;
    onAppReady(cb: () => void): void;
    isAppReady(): Promise<boolean>;
    openSettings(): void;
    openCharactersFolder(): void;
    /** Primary display work area, for the settings "Fill screen" button. */
    getWorkArea(): Promise<WindowRect>;
    saveSettings(patch: SettingsPatch): Promise<SaveSettingsResult>;
    listCharacters(): Promise<CharacterSummary[]>;
    selectCharacter(id: string): Promise<SelectCharacterResult>;
    onAvatarChanged(cb: (image: string) => void): void;
}