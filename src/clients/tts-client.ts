import type { TtsConfig } from '../../shared/contract';
import { PCM16_BYTES, WAV_HEADER_BYTES, pcm16ToFloat32 } from '../utils/audio';
import { errorMessage, ServiceError } from '../utils/errors';

const SPEECH_TOTAL_TIMEOUT_MS = 240_000; 

const CONNECT_BUDGET_MS = 90_000; 

const FIRST_BYTE_TIMEOUT_MS = 90_000; 

const CONNECT_RETRY_DELAY_MS = 2_500;

interface StreamOptions {
    
    firstByteCtrl?: AbortController;
    
    onChunk?: (f32: Float32Array) => void;
}

export class TtsClient {
    constructor(
        private readonly config: TtsConfig,
        private readonly onChunk: (f32: Float32Array) => void,
        private readonly toast: (msg: string) => void,
    ) {}

    public async speak(text: string): Promise<void> {
        const ctrl = new AbortController();
        const totalTimer = setTimeout(() => {
            ctrl.abort();
        }, SPEECH_TOTAL_TIMEOUT_MS);
        try {
            const res = await this.connectWithRetry(text, ctrl.signal);
            if (!res.ok) {
                throw new ServiceError(
                    'tts',
                    `HTTP ${res.status} at ${this.speechUrl()}`,
                    res.status,
                );
            }
            const chunks = await this.streamChunks(res, this.config.responseFormat, {
                firstByteCtrl: ctrl,
                onChunk: this.onChunk,
            });
            console.log(`[voice-box] TTS streamed ${chunks} chunk(s)`);
        } finally {
            clearTimeout(totalTimer);
        }
    }

    private speechUrl(): string {
        return `${this.config.url.replace(/\/$/, '')}/v1/audio/speech`;
    }

    private buildRequest(
        text: string,
        responseFormat: TtsConfig['responseFormat'],
        signal: AbortSignal,
    ): RequestInit {
        return {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'tts-1',
                input: text,
                voice: this.config.voice,
                response_format: responseFormat,
                language: this.config.language,
            }),
            signal,
        };
    }

    

    private async connectWithRetry(
        text: string,
        signal: AbortSignal,
    ): Promise<Response> {
        const url = this.speechUrl();
        const connectStart = Date.now();
        while (true) {
            try {
                return await fetch(
                    url,
                    this.buildRequest(text, this.config.responseFormat, signal),
                );
            } catch (err) {
                if (
                    signal.aborted ||
                    Date.now() - connectStart > CONNECT_BUDGET_MS
                ) {
                    throw new ServiceError('tts', `${errorMessage(err)} at ${url}`);
                }
                console.log(
                    '[voice-box] TTS connect failed, retrying…',
                    errorMessage(err),
                );
                this.toast(
                    'TTS server not reachable yet — waiting for it to load (~45s)…',
                );
                const { promise, resolve } = Promise.withResolvers<void>();
                setTimeout(resolve, CONNECT_RETRY_DELAY_MS);
                await promise;
            }
        }
    }

    

    private async streamChunks(
        res: Response,
        responseFormat: TtsConfig['responseFormat'],
        { firstByteCtrl, onChunk }: StreamOptions = {},
    ): Promise<number> {
        const reader = res.body!.getReader();
        const firstByteTimer = firstByteCtrl
            ? setTimeout(() => firstByteCtrl.abort(), FIRST_BYTE_TIMEOUT_MS)
            : undefined;
        let pending = Buffer.alloc(0);
        let skipBytes = responseFormat === 'wav' ? WAV_HEADER_BYTES : 0;
        let chunks = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                clearTimeout(firstByteTimer);
                if (!value || value.length === 0) {
                    continue;
                }
                let buf = pending.length
                    ? Buffer.concat([pending, Buffer.from(value)])
                    : Buffer.from(value);
                if (skipBytes > 0) {
                    const drop = Math.min(skipBytes, buf.length);
                    buf = buf.subarray(drop);
                    skipBytes -= drop;
                }
                pending = buf;
                const usable = pending.length - (pending.length % PCM16_BYTES);
                if (usable > 0) {
                    const chunk = pending.subarray(0, usable);
                    pending = pending.subarray(usable);
                    const i16 = new Int16Array(
                        chunk.buffer,
                        chunk.byteOffset,
                        usable / PCM16_BYTES,
                    );
                    onChunk?.(pcm16ToFloat32(i16));
                    chunks++;
                }
            }
            return chunks;
        } catch (err) {
            throw new ServiceError('tts', errorMessage(err));
        } finally {
            clearTimeout(firstByteTimer);
        }
    }
}