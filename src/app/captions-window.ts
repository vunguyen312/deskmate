import { BrowserWindow } from 'electron';
import {
    CHANNELS,
    type CaptionWindowConfig,
} from '../../shared/contract';
import { PRELOAD_PATH } from '../utils/paths';

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

        win.setIgnoreMouseEvents(true, { forward: true });
        win.setAlwaysOnTop(true, 'screen-saver');
        this.browserWindow = win;
        win.loadURL(`http://127.0.0.1:${this.port}/renderer/captions.html`);
    }

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
