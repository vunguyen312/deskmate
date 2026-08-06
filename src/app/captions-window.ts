import { BrowserWindow } from 'electron';
import {
    CHANNELS,
    type CaptionWindowConfig,
} from '../../shared/contract';
import { PRELOAD_PATH } from '../utils/paths';

/**
 * The standalone subtitles window: a transparent, always-on-top surface that
 * can stretch across the whole screen. It is click-through and never focused,
 * so it never blocks or steals input from the windows underneath it.
 */
export class CaptionsWindow {
    private browserWindow: BrowserWindow | null = null;

    constructor(
        private readonly port: number,
        private readonly config: CaptionWindowConfig,
    ) {}

    public create(): void {
        const { x, y, width, height } = this.config;
        const win = new BrowserWindow({
            x,
            y,
            width,
            height,
            show: this.config.enabled,
            transparent: true,
            frame: false,
            alwaysOnTop: true,
            resizable: false,
            skipTaskbar: true,
            hasShadow: false,
            fullscreenable: false,
            focusable: false,
            webPreferences: {
                preload: PRELOAD_PATH,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });
        // Clicks must pass through to the windows underneath; `forward: true`
        // still lets the page see mouse moves (hover, :active) if ever needed.
        win.setIgnoreMouseEvents(true, { forward: true });
        win.setAlwaysOnTop(true, 'screen-saver');
        this.browserWindow = win;
        win.loadURL(`http://127.0.0.1:${this.port}/renderer/captions.html`);
    }

    /**
     * Apply a new geometry + font size, e.g. right after a settings save.
     * `enabled` controls visibility: hiding keeps geometry and state, and
     * show/hide are idempotent no-ops when unchanged.
     */
    public apply(config: CaptionWindowConfig): void {
        if (!this.browserWindow || this.browserWindow.isDestroyed()) {
            return;
        }
        const { x, y, width, height } = config;
        this.browserWindow.setBounds({ x, y, width, height });
        if (config.enabled) {
            this.browserWindow.show();
        } else {
            this.browserWindow.hide();
        }
        this.browserWindow.webContents.send(CHANNELS.captionsConfig, config);
    }

    public send(channel: string, ...args: unknown[]): void {
        if (this.browserWindow && !this.browserWindow.isDestroyed()) {
            this.browserWindow.webContents.send(channel, ...args);
        }
    }
}
