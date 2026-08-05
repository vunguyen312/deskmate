import type { SttConfig } from '../../shared/contract';
import { float32ToPcm16, wavHeader } from '../utils/audio';
import { errorMessage, ServiceError } from '../utils/errors';

const STT_SAMPLE_RATE = 16000;

const REQUEST_TIMEOUT_MS = 60_000;

export class SttClient {
    constructor(private readonly config: SttConfig) {}

    public async transcribe(f32: Float32Array): Promise<string> {
        const pcm = float32ToPcm16(f32);
        const wav = Buffer.concat([
            wavHeader(STT_SAMPLE_RATE, pcm.length),
            pcm,
        ]);
        const form = new FormData();
        form.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');
        form.append('language', this.config.language);
        form.append('response_format', 'json');
        form.append('no_timestamps', 'true');

        const url = new URL(this.config.url);
        url.pathname = '/inference';
        let res: Response;
        try {
            res = await fetch(url, {
                method: 'POST',
                body: form,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (err) {
            throw new ServiceError('stt', errorMessage(err));
        }
        if (!res.ok) {
            throw new ServiceError('stt', `HTTP ${res.status}`, res.status);
        }
        const data = (await res.json()) as { text?: unknown };
        if (typeof data.text === 'string') {
            return data.text.trim();
        }
        return '';
    }
}
