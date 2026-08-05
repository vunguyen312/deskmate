

export const WAV_HEADER_BYTES = 44;
export const PCM16_BYTES = 2; 

export const PCM16_MAX = 32767; 

export const PCM16_DIVISOR = 32768; 

export function wavHeader(sampleRate: number, dataLen: number): Buffer {
    const nChannels = 1;
    const bits = 16;
    const byteRate = (sampleRate * nChannels * bits) / 8;
    const blockAlign = (nChannels * bits) / 8;
    const buf = Buffer.alloc(WAV_HEADER_BYTES);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(WAV_HEADER_BYTES - 8 + dataLen, 4);
    buf.write('WAVE', 8, 'ascii');
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(nChannels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(byteRate, 28);
    buf.writeUInt16LE(blockAlign, 32);
    buf.writeUInt16LE(bits, 34);
    buf.write('data', 36, 'ascii');
    buf.writeUInt32LE(dataLen, 40);
    return buf;
}

export function float32ToPcm16(samples: Float32Array): Buffer {
    const pcm = Buffer.alloc(samples.length * PCM16_BYTES);
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcm.writeInt16LE(Math.round(s * PCM16_MAX), i * PCM16_BYTES);
    }
    return pcm;
}

export function pcm16ToFloat32(i16: Int16Array): Float32Array {
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) {
        f32[i] = i16[i] / PCM16_DIVISOR;
    }
    return f32;
}