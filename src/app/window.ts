import { BrowserWindow, Menu, app, ipcMain } from 'electron';
import { CHANNELS, type WindowConfig } from '../../shared/contract';
import { PRELOAD_PATH } from '../utils/paths';

export class PetWindow {
    private browserWindow: BrowserWindow | null = null;

    constructor(
        private readonly port: number,
        private readonly windowConfig: WindowConfig,
    ) {
        this.registerDragIpc();
    }

    public create(): void {
        const win = new BrowserWindow({
            width: this.windowConfig.width,
            height: this.windowConfig.height,
            transparent: true,
            frame: false,
            alwaysOnTop: true,
            resizable: false,
            skipTaskbar: true,
            hasShadow: false,
            fullscreenable: false,
            webPreferences: {
                preload: PRELOAD_PATH,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });
        this.browserWindow = win;
        win.loadURL(`http://127.0.0.1:${this.port}/renderer/index.html`);

        win.webContents.on('context-menu', () => {
            const menu = Menu.buildFromTemplate([
                {
                    label: 'Quit',
                    click: () => {
                        app.quit();
                    },
                },
            ]);
            menu.popup({ window: win });
        });
        win.webContents.on('before-input-event', (_e, input) => {
            if (input.control && input.key.toLowerCase() === 'q') {
                app.quit();
            }
        });
    }

    public send(channel: string, ...args: unknown[]): void {
        if (this.browserWindow && !this.browserWindow.isDestroyed()) {
            this.browserWindow.webContents.send(channel, ...args);
        }
    }

    /**
     * Apply new dimensions, e.g. right after a settings save.
     *
     * Uses setBounds (not setSize): on X11 a `resizable: false` window's WM
     * size hints stick at the largest size ever set, so setSize can grow the
     * window but silently refuses to shrink it. setBounds works both ways.
     */
    public apply(config: WindowConfig): void {
        if (!this.browserWindow || this.browserWindow.isDestroyed()) {
            return;
        }
        const [x, y] = this.browserWindow.getPosition();
        this.browserWindow.setBounds({
            x,
            y,
            width: config.width,
            height: config.height,
        });
    }

    private registerDragIpc(): void {
        ipcMain.on(CHANNELS.windowDragStart, () => {
            
        });
        ipcMain.on(CHANNELS.windowDragMoveTo, (_e, x: number, y: number) => {
            this.moveTo(x, y);
        });
        ipcMain.on(CHANNELS.windowDragEnd, () => {
            
        });
        ipcMain.handle(CHANNELS.getWindowPosition, () => {
            if (!this.browserWindow || this.browserWindow.isDestroyed()) {
                return { x: 0, y: 0 };
            }
            const [x, y] = this.browserWindow.getPosition();
            return { x, y };
        });
    }

    /**
     * Absolute move: the renderer computes the target (anchor + cursor
     * displacement) so repeated or queued messages converge on the same
     * position instead of accumulating. Incremental moves against the window's
     * own position feed back at speed — the lag between setPosition and the
     * next event's coordinates makes the window overshoot and oscillate
     * ("shake") on compositors with async moves (WSLg).
     */
    private moveTo(x: number, y: number): void {
        if (!this.browserWindow || this.browserWindow.isDestroyed()) {
            return;
        }
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }
        this.browserWindow.setPosition(Math.round(x), Math.round(y));
    }
}