import type { AppConfig, VoiceBoxApi } from '../../shared/contract';
import { AudioPlayer } from './audio-player';
import { Captions } from './captions';
import { Toast } from './toast';
import { VadController } from './vad-controller';
import { WindowDragController } from './window-drag';

declare global {
    interface Window {
        api: VoiceBoxApi;
    }
}

const img = document.getElementById('momo') as HTMLImageElement;
const toastEl = document.getElementById('toast') as HTMLDivElement;
const micBtn = document.getElementById('mic-btn') as HTMLButtonElement;
const loadingEl = document.getElementById('loading') as HTMLDivElement;
const captionsEl = document.getElementById('captions') as HTMLDivElement;
const captionTextEl = document.getElementById('caption-text') as HTMLSpanElement;
const body = document.body;

const captions = new Captions(captionsEl, captionTextEl);

function finishLoading(): void {
    body.classList.remove('loading');
    loadingEl.classList.add('hidden');
}

async function main(): Promise<void> {
    const config: AppConfig = await window.api.getConfig();
    if (config.image.startsWith('http')) {
        img.src = config.image;
    } else {
        const imageUrl = new URL(config.image, location.origin);
        img.src = imageUrl.href;
    }

    const toast = new Toast(toastEl);
    window.api.onToast((msg) => {
        toast.show(msg);
    });
    

    window.api.onAppReady(finishLoading);
    

    if (await window.api.isAppReady()) {
        finishLoading();
    }

    const audioContext = new AudioContext();
    const vad = new VadController(
        config.vad,
        audioContext,
        (audio) => {
            captions.showWaiting(); 

            window.api.sendSpeech(audio);
        },
        toast,
    );
    const player = new AudioPlayer(
        config.tts.sampleRate,
        audioContext,
        body,
        (speaking) => {
            if (speaking) {
                void vad.pauseForSpeech();
            } else {
                void vad.resumeForSpeech();
            }
        },
    );
    window.api.onSttText((text) => {
        captions.setText(text);
    });
    window.api.onLlmText((text) => {
        captions.setText(text);
    });
    window.api.onTtsChunk((buf) => {
        captions.hideWaiting(); 

        const f32 = new Float32Array(buf);
        player.enqueue(f32);
    });
    window.api.onTtsEnd(() => {
        captions.hideWaiting(); 

        player.finish();
    });

    const drag = new WindowDragController(img, window.api);
    drag.attach();

    function syncMicState(): void {
        const listening = vad.isListening;
        micBtn.classList.toggle('live', listening);
        micBtn.title = listening ? 'クリックでミュート' : 'クリックでマイクをオン';
    }

    micBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); 

        void vad.toggleUserMute().then(syncMicState);
    });
}

void main().catch((err) => {
    console.error('[voice-box] renderer init failed:', err);
    let reason = String(err);
    if (err instanceof Error) {
        reason = err.message;
    }
    const errorToast = new Toast(toastEl);
    errorToast.show('Renderer init failed: ' + reason);
});