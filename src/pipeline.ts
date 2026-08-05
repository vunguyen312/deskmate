import type { AppConfig, ChatMessage } from '../shared/contract';
import { CHANNELS } from '../shared/contract';
import { errorMessage, ServiceError } from './utils/errors';
import type { LlmClient } from './clients/llm-client';
import type { SttClient } from './clients/stt-client';
import type { TtsClient } from './clients/tts-client';
import { STT_DEFAULT_PORT } from './services/stt-service';
import { TTS_DEFAULT_PORT } from './services/tts-service';
import { servicePort } from './utils/urls';
import type { PetWindow } from './app/window';

const DEFAULT_HISTORY_CAP = 20;

export class ConversationPipeline {
    private busy = false;
    private history: ChatMessage[] = [];

    constructor(
        private readonly deps: {
            stt: SttClient;
            llm: LlmClient;
            tts: TtsClient;
            window: PetWindow;
            config: AppConfig;
            historyCap?: number;
        },
    ) {}

    public async run(audio: Float32Array): Promise<void> {
        const {
            stt,
            llm,
            tts,
            window,
            config,
            historyCap = DEFAULT_HISTORY_CAP,
        } = this.deps;
        if (this.busy) {
            console.log('[voice-box] pipeline busy, dropping speech');
            return;
        }
        this.busy = true;
        try {
            const text = await stt.transcribe(audio);
            if (!text) {
                console.log('[voice-box] empty transcription, skipping');
                window.send(CHANNELS.ttsEnd); 

                return;
            }
            console.log('[voice-box] STT:', text);
            window.send(CHANNELS.sttText, text);
            const reply = await llm.chat(text, this.history);
            console.log('[voice-box] LLM:', reply);
            window.send(CHANNELS.llmText, reply);
            this.history.push({ role: 'user', content: text });
            this.history.push({ role: 'assistant', content: reply });
            if (this.history.length > historyCap) {
                this.history = this.history.slice(-historyCap);
            }
            await tts.speak(reply);
            window.send(CHANNELS.ttsEnd);
        } catch (err) {
            const reason = errorMessage(err);
            let msg: string;
            if (err instanceof ServiceError && err.kind === 'stt') {
                const port = servicePort(config.stt.url, STT_DEFAULT_PORT);
                msg = `STT request failed (${reason}). Start it: whisper-server -m voice-box/models/ggml-small.bin --port ${port}`;
            } else if (err instanceof ServiceError && err.kind === 'llm') {
                msg = `LLM error (${reason}). Check that llama-server is running and the model file exists in voice-box/models/.`;
            } else if (err instanceof ServiceError && err.kind === 'tts') {
                msg = `TTS error (${reason}). Start it: python server/openai_server.py --voices momo/voices.json --language Japanese --port ${TTS_DEFAULT_PORT}`;
            } else {
                msg = `Pipeline error: ${reason}`;
            }
            console.error('[voice-box] pipeline error:', err);
            window.send(CHANNELS.toast, msg);
            window.send(CHANNELS.ttsEnd);
        } finally {
            this.busy = false;
        }
    }
}