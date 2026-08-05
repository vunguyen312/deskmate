import type { VoiceBoxApi } from '../../shared/contract';
import { Captions } from './captions';

declare global {
    interface Window {
        api: VoiceBoxApi;
    }
}

const captionsEl = document.getElementById('captions') as HTMLDivElement;
const captionTextEl = document.getElementById(
    'caption-text',
) as HTMLSpanElement;
const captions = new Captions(captionsEl, captionTextEl);

function applyFontSize(size: number): void {
    document.documentElement.style.setProperty(
        '--caption-font-size',
        `${size}px`,
    );
}

async function main(): Promise<void> {
    const config = await window.api.getConfig();
    applyFontSize(config.captions.fontSize);

    window.api.onCaptionsConfig((cfg) => {
        applyFontSize(cfg.fontSize);
    });

    window.api.onSpeechStart(() => {
        captions.showWaiting();
    });
    window.api.onSttText((text) => {
        captions.setText(text);
    });
    window.api.onLlmText((text) => {
        captions.setText(text);
    });
    window.api.onTtsChunk(() => {
        captions.hideWaiting();
    });
    window.api.onTtsStart(() => {
        captions.hideWaiting();
    });
    window.api.onTtsEnd(() => {
        captions.hideWaiting();
    });
}

void main().catch((err) => {
    console.error('[voice-box] captions renderer init failed:', err);
});
