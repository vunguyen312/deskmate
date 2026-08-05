

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
    responseFormat: 'pcm' | 'wav';
    sampleRate: number;
    spawn: boolean;
}

export interface VadConfig {
    threshold: number;
    minSilenceFrames: number;
}

export interface WindowConfig {
    width: number;
    height: number;
}

export interface DebugConfig {
    autoSendWav: string;
}

export interface AppConfig {
    llm: LlmConfig;
    stt: SttConfig;
    tts: TtsConfig;
    vad: VadConfig;
    image: string;
    window: WindowConfig;
    debug: DebugConfig;
}

export const CHANNELS = {
    getConfig: 'get-config',
    speechAudio: 'speech-audio',
    sttText: 'stt-text',
    llmText: 'llm-text',
    ttsChunk: 'tts-chunk',
    ttsEnd: 'tts-end',
    toast: 'toast',
    windowDragStart: 'window-drag-start',
    windowDragMove: 'window-drag-move',
    windowDragEnd: 'window-drag-end',
    quit: 'quit',
    appReady: 'app-ready',
    appReadyQuery: 'app-ready-query',
} as const;

export interface VoiceBoxApi {
    getConfig(): Promise<AppConfig>;
    sendSpeech(audio: Float32Array): void;
    onSttText(cb: (text: string) => void): void;
    onLlmText(cb: (text: string) => void): void;
    onTtsChunk(cb: (buf: ArrayBuffer) => void): void;
    onTtsEnd(cb: () => void): void;
    onToast(cb: (msg: string) => void): void;
    windowDragStart(): void;
    windowDragMove(dx: number, dy: number): void;
    windowDragEnd(): void;
    quit(): void;
    onAppReady(cb: () => void): void;
    isAppReady(): Promise<boolean>;
}