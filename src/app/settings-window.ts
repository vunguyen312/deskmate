import { BrowserWindow } from 'electron';
import { PRELOAD_PATH } from '../utils/paths';

export class SettingsWindow {
    private win: BrowserWindow | null = null;

    constructor(private readonly port: number) {}

    public open(): void {
        if (this.win && !this.win.isDestroyed()) {
            this.win.focus();
            return;
        }
        const win = new BrowserWindow({
            width: 440,
            height: 760,
            useContentSize: true,
            title: 'voice-box Settings',
            resizable: false,
            maximizable: false,
            fullscreenable: false,
            backgroundColor: '#161618',
            webPreferences: {
                preload: PRELOAD_PATH,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });
        win.setMenuBarVisibility(false);
        win.loadURL(`http://127.0.0.1:${this.port}/renderer/settings.html`);
        win.on('closed', () => {
            this.win = null;
        });
        this.win = win;
    }
}
