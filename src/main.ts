import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { app, ipcMain, session, shell } from 'electron';
import * as path from 'node:path';
import {
    CHANNELS,
    LANGUAGE_OPTIONS,
    TTS_MODEL_OPTIONS,
    type AppConfig,
    type CharacterInfo,
    type SettingsPatch,
} from '../shared/contract';
import { Config } from './app/config';
import { CharacterRegistry } from './app/characters';
import { scheduleAutoSendWav } from './dev/debug';
import { LlmClient } from './clients/llm-client';
import { APP_DIR } from './utils/paths';
import { ConversationPipeline } from './pipeline';
import type { ChildService } from './services/child-service';
import { LlamaService } from './services/llama-service';
import { SttService } from './services/stt-service';
import { TtsService } from './services/tts-service';
import { SettingsWindow } from './app/settings-window';
import { StaticServer } from './app/static-server';
import { SttClient } from './clients/stt-client';
import { TtsClient } from './clients/tts-client';
import { PetWindow } from './app/window';

if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-transparent-visuals');
}
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const config = new Config(path.join(APP_DIR, 'config.json'));
const characters = new CharacterRegistry();

/** Absolute-path lookup for a binary, independent of the launcher's PATH. */
function resolveBinary(name: string): string | null {
    const candidates = ['/usr/bin', '/bin', '/usr/local/bin', '/opt/homebrew/bin'];
    for (const dir of candidates) {
        const p = path.join(dir, name);
        if (existsSync(p)) {
            return p;
        }
    }
    for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
        if (!dir) {
            continue;
        }
        const p = path.join(dir, name);
        if (existsSync(p)) {
            return p;
        }
    }
    return null;
}

/**
 * Open a directory in the platform's file manager. shell.openPath shells out
 * to xdg-open on Linux, which is frequently missing or outside the launcher's
 * PATH (WSL has neither) — spawn an opener with an absolute path instead.
 * A spawned opener counts as success unless it errors out; Explorer returns
 * exit code 1 even when it opens fine, so exit codes are not consulted.
 */
function openFolder(dir: string, toast: (msg: string) => void): void {
    type Attempt = { bin: string; args: () => string[] | null };
    const attempts: Attempt[] = [];
    if (process.platform === 'linux') {
        // Windows Explorer through WSL interop (UNC path) — the reliable
        // opener on WSL2.
        attempts.push({
            bin: 'explorer.exe',
            args: () => {
                const wslpath = resolveBinary('wslpath');
                if (wslpath) {
                    const res = spawnSync(wslpath, ['-w', dir]);
                    if (res.status === 0 && res.stdout.length > 0) {
                        return [res.stdout.toString().trim()];
                    }
                }
                const distro = process.env.WSL_DISTRO_NAME;
                return distro ? [`\\\\wsl.localhost\\${distro}${dir}`] : null;
            },
        });
        attempts.push({ bin: 'xdg-open', args: () => [dir] });
        attempts.push({ bin: 'wslview', args: () => [dir] });
        attempts.push({ bin: 'gio', args: () => ['open', dir] });
    }

    const tryNext = (index: number): void => {
        if (index >= attempts.length) {
            // Last resort: Electron's native opener (works on win32/darwin,
            // and on Linux when xdg-open happens to be on PATH).
            void shell.openPath(dir).then((err) => {
                if (err) {
                    console.error('[voice-box] open folder:', err);
                    toast(`Could not open ${dir}: ${err}`);
                }
            });
            return;
        }
        const attempt = attempts[index];
        const resolved = resolveBinary(attempt.bin);
        if (!resolved) {
            tryNext(index + 1);
            return;
        }
        const args = attempt.args();
        if (!args) {
            tryNext(index + 1);
            return;
        }
        let child;
        try {
            child = spawn(resolved, args, {
                detached: true,
                stdio: 'ignore',
            });
        } catch (err) {
            console.error('[voice-box] open folder:', attempt.bin, err);
            tryNext(index + 1);
            return;
        }
        console.log(`[voice-box] opening folder with ${attempt.bin}`);
        child.on('error', (err) => {
            console.error('[voice-box] open folder:', attempt.bin, err);
            tryNext(index + 1);
        });
        child.unref();
    };
    tryNext(0);
}

/**
 * Overlay a character's persona onto the effective config. Mutates in place so
 * the services and clients holding references to `config.data.llm/tts/stt`
 * pick the change up without being reconstructed. Language and the TTS model
 * are app-level settings (config.json) and are left untouched.
 */
function applyCharacter(cfg: AppConfig, character: CharacterInfo): void {
    cfg.character = character.id;
    cfg.image = characters.resolveImage(character);
    cfg.tts.voicesFile = characters.voicesFile(character);
    const voice = characters.firstVoice(character.id);
    if (voice) {
        cfg.tts.voice = voice;
    }
    if (character.systemPrompt !== undefined) {
        cfg.llm.systemPrompt = character.systemPrompt;
    }
    if (character.llm) {
        Object.assign(cfg.llm, character.llm);
    }
}

// Adopt the configured character; fall back to the first available one.
{
    const active = characters.get(config.data.character) ?? characters.list()[0];
    if (active) {
        applyCharacter(config.data, active);
        if (config.data.character !== active.id) {
            config.save();
        }
    }
}

let petWindow: PetWindow | null = null;
function toast(message: string): void {
    petWindow?.send(CHANNELS.toast, message);
}

let services: ChildService[] = [];

app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => {
        cb(true);
    });
    const port = await new StaticServer(APP_DIR).start();
    console.log(`[voice-box] static server on 127.0.0.1:${port}`);
    petWindow = new PetWindow(port, config.data.window);
    petWindow.create();
    const settingsWindow = new SettingsWindow(port);

    const ttsClient = new TtsClient(
        config.data.tts,
        (f32) => {
            petWindow!.send(CHANNELS.ttsChunk, f32.buffer, [f32.buffer]);
        },
        toast,
    );
    const pipeline = new ConversationPipeline({
        stt: new SttClient(config.data.stt),
        llm: new LlmClient(config.data.llm),
        tts: ttsClient,
        window: petWindow,
        config: config.data,
    });

    const sttService = new SttService(
        config.data.stt,
        () => {
            scheduleAutoSendWav(config.data.debug.autoSendWav, pipeline, toast);
        },
        toast,
    );
    const llamaService = new LlamaService(config.data.llm, toast);
    const ttsService = new TtsService(config.data.tts, toast);
    services = [sttService, llamaService, ttsService];

    let appReady = false;
    ipcMain.handle(CHANNELS.appReadyQuery, () => {
        return appReady;
    });
    
    
    
    void Promise.all(services.map((s) => s.settled)).then(() => {
        appReady = true;
        console.log('[voice-box] services settled; app ready');
        petWindow?.send(CHANNELS.appReady);
    });

    ipcMain.handle(CHANNELS.getConfig, () => {
        return config.data;
    });

    ipcMain.on(CHANNELS.openSettings, () => {
        settingsWindow.open();
    });

    ipcMain.on(CHANNELS.openCharactersFolder, () => {
        openFolder(path.resolve(characters.root), toast);
    });

    ipcMain.handle(
        CHANNELS.saveSettings,
        async (_e, patch: SettingsPatch) => {
            const lang = LANGUAGE_OPTIONS.find(
                (o) => o.stt === patch.language,
            );
            if (
                !lang ||
                !TTS_MODEL_OPTIONS.some((m) => m.id === patch.ttsModel)
            ) {
                throw new Error('invalid settings payload');
            }
            // App-level settings: persist in config.json, independent of the
            // active character. Language is applied per request by the
            // clients; only a TTS model change needs a server restart.
            const prevModel = config.data.tts.model;
            config.data.stt.language = lang.stt;
            config.data.tts.language = lang.tts;
            config.data.tts.model = patch.ttsModel;
            config.save();
            let ttsRestarting = false;
            if (config.data.tts.model !== prevModel) {
                ttsRestarting = true;
                toast('Switching TTS model… (~60s)');
                void ttsService.restart().catch((err) => {
                    console.error('[voice-box] TTS restart failed:', err);
                });
            }
            return { ok: true, ttsRestarting };
        },
    );

    ipcMain.handle(CHANNELS.listCharacters, () => {
        return characters
            .list()
            .map((c) => characters.summary(c, config.data.character));
    });

    ipcMain.handle(CHANNELS.selectCharacter, async (_e, id: string) => {
        const next = characters.get(id);
        if (!next) {
            throw new Error(`unknown character: ${id}`);
        }
        if (id === config.data.character) {
            return { ok: true, ttsRestarting: false, llmRestarting: false };
        }
        const ttsKey = (): string =>
            [
                config.data.tts.model,
                config.data.tts.voicesFile,
                config.data.tts.language,
            ].join('|');
        const prevTtsKey = ttsKey();
        const prevLlmModel = config.data.llm.model;
        applyCharacter(config.data, next);
        config.save();
        const ttsRestarting = ttsKey() !== prevTtsKey;
        const llmRestarting = config.data.llm.model !== prevLlmModel;
        petWindow?.send(CHANNELS.avatarChanged, config.data.image);
        if (ttsRestarting) {
            toast('Switching voice…');
            void ttsService.restart().catch((err) => {
                console.error('[voice-box] TTS restart failed:', err);
            });
        }
        if (llmRestarting) {
            toast('Switching LLM model…');
            void llamaService.restart().catch((err) => {
                console.error('[voice-box] llama restart failed:', err);
            });
        }
        return { ok: true, ttsRestarting, llmRestarting };
    });
    ipcMain.on(CHANNELS.speechAudio, (_e, audio: Float32Array) => {
        void pipeline.run(audio);
    });
    ipcMain.on(CHANNELS.quit, () => {
        app.quit();
    });

    void sttService.ensureStarted();
    void llamaService.ensureStarted();
    void ttsService.ensureStarted();
});

app.on('before-quit', () => {
    for (const s of services) {
        s.stop();
    }
});
app.on('window-all-closed', () => {
    app.quit();
});