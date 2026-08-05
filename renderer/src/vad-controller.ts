import { MicVAD } from '@ricky0123/vad-web';
import type { VadConfig } from '../../shared/contract';
import type { Toast } from './toast';

export class VadController {
    private vad: MicVAD | null = null;
    private initAttempted = false;
    private running = false;
    private userMuted = true; 

    private speechSuppressed = false; 

    constructor(
        private readonly config: VadConfig,
        private readonly audioContext: AudioContext,
        private readonly onSpeech: (audio: Float32Array) => void,
        private readonly toast: Toast,
    ) {}

    
    public get isListening(): boolean {
        return this.running && !this.userMuted && !this.speechSuppressed;
    }

    
    public async toggleUserMute(): Promise<boolean> {
        this.userMuted = !this.userMuted;
        if (!this.userMuted) {
            await this.ensureStarted();
        }
        await this.applyListening();
        return this.isListening;
    }

    
    public async pauseForSpeech(): Promise<void> {
        this.speechSuppressed = true;
        await this.applyListening();
    }

    
    public async resumeForSpeech(): Promise<void> {
        this.speechSuppressed = false;
        await this.applyListening();
    }

    private async ensureStarted(): Promise<void> {
        if (this.initAttempted) {
            return;
        }
        this.initAttempted = true;
        try {
            await this.audioContext.resume();
            this.vad = await MicVAD.new({
                audioContext: this.audioContext,
                startOnLoad: false,
                positiveSpeechThreshold: this.config.threshold,
                baseAssetPath: '/vendor/',
                onnxWASMBasePath: '/ort-wasm/',
                onSpeechEnd: (audio) => {
                    this.onSpeech(audio);
                },
                onSpeechStart: () => {
                    

                },
                onVADMisfire: () => {
                    

                },
            });
            this.running = true;
            console.log('[voice-box] VAD started');
        } catch (err) {
            console.error('[voice-box] VAD init failed:', err);
            let reason = String(err);
            if (err instanceof Error) {
                reason = err.message;
            }
            this.toast.show('Microphone unavailable: ' + reason);
            this.running = false;
            this.initAttempted = false; 

        }
    }

    private async applyListening(): Promise<void> {
        if (!this.vad) {
            return;
        }
        if (this.isListening) {
            await this.vad.start().catch(() => {
                

            });
            console.log('[voice-box] VAD listening');
        } else {
            await this.vad.pause().catch(() => {
                

            });
            console.log('[voice-box] VAD muted');
        }
    }
}