import type { AppConfig, VoiceBoxApi } from '../../shared/contract';
import { AudioPlayer } from './audio-player';
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
const body = document.body;

function resolveImageSrc(image: string): string {
    if (image.startsWith('http')) {
        return image;
    }
    return new URL(image, location.origin).href;
}

function setAvatar(src: string | undefined): void {
    if (src) {
        img.src = resolveImageSrc(src);
    } else {
        img.removeAttribute('src');
    }
}

function finishLoading(): void {
    body.classList.remove('loading');
    loadingEl.classList.add('hidden');
}

async function main(): Promise<void> {
    const config: AppConfig = await window.api.getConfig();
    setAvatar(config.image);
    window.api.onAvatarChanged((image) => {
        setAvatar(image);
    });

    const settingsBtn = document.getElementById(
        'settings-btn',
    ) as HTMLButtonElement;
    settingsBtn.addEventListener('click', () => {
        window.api.openSettings();
    });

    const exitBtn = document.getElementById('exit-btn') as HTMLButtonElement;
    exitBtn.addEventListener('click', () => {
        window.api.quit();
    });

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
    window.api.onTtsChunk((buf) => {
        const f32 = new Float32Array(buf);
        player.enqueue(f32);
    });
    window.api.onTtsEnd(() => {
        player.finish();
    });

    const drag = new WindowDragController(img, window.api);
    drag.attach();

    function syncMicState(): void {
        const listening = vad.isListening;
        micBtn.classList.toggle('live', listening);
        micBtn.title = listening ? 'Click to mute' : 'Click to turn on mic';
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