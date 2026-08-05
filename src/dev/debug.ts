import { readFile } from 'node:fs';
import { PCM16_BYTES, WAV_HEADER_BYTES, pcm16ToFloat32 } from '../utils/audio';
import { errorMessage } from '../utils/errors';
import type { ConversationPipeline } from '../pipeline';

const AUTO_SEND_DELAY_MS = 2000; 

export function scheduleAutoSendWav(
    wavPath: string,
    pipeline: ConversationPipeline,
    toast: (msg: string) => void,
): void {
    const p = wavPath;
    if (!p) {
        return;
    }
    setTimeout(() => {
        readFile(p, (err, buf) => {
            if (err) {
                toast(
                    `debug.autoSendWav: cannot read ${p}: ${errorMessage(err)}`,
                );
                return;
            }
            if (buf.length < WAV_HEADER_BYTES) {
                toast('debug.autoSendWav: file too small to be a WAV');
                return;
            }
            const i16 = new Int16Array(
                buf.buffer,
                buf.byteOffset + WAV_HEADER_BYTES,
                (buf.length - WAV_HEADER_BYTES) / PCM16_BYTES,
            );
            const f32 = pcm16ToFloat32(i16);
            console.log(
                `[voice-box] autoSendWav: feeding ${f32.length} samples`,
            );
            void pipeline.run(f32);
        });
    }, AUTO_SEND_DELAY_MS);
}