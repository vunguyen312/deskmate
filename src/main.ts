import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { app, ipcMain, screen, session, shell } from 'electron';
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
import { ConversationPipeline, type WindowTarget } from './pipeline';
import type { ChildService } from './services/child-service';
import { LlamaService } from './services/llama-service';
import { SttService } from './services/stt-service';
import { TtsService } from './services/tts-service';
import { SettingsWindow } from './app/settings-window';
import { StaticServer } from './app/static-server';
import { SttClient } from './clients/stt-client';
import { TtsClient } from './clients/tts-client';
import { PetWindow } from './app/window';
import { CaptionsWindow } from './app/captions-window';

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
 * pick the change up without being reconstructed. Only the persona
 * (`systemPrompt`) and voice are character-specific: LLM settings, language,
 * and the TTS model are app-level settings (config.json) and are left
 * untouched.
 */
function applyCharacter(cfg: AppConfig, character: CharacterInfo): void {
    cfg.character = character.id;
    cfg.image = characters.resolveImage(character.id) ?? undefined;
    cfg.tts.voicesFile = characters.voicesFile(character);
    const voice = characters.firstVoice(character.id);
    if (voice) {
        cfg.tts.voice = voice;
    }
    if (character.systemPrompt !== undefined) {
        cfg.llm.systemPrompt = character.systemPrompt;
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
    const port = await new StaticServer(APP_DIR).start();
    console.log(`[voice-box] static server on 127.0.0.1:${port}`);
    // The only permission the app needs is the microphone (Silero VAD in the
    // pet window). Grant 'media' to our own local pages alone and deny every
    // other permission to every origin.
    const isLocalOrigin = (wc: Electron.WebContents | null): boolean =>
        wc !== null && wc.getURL().startsWith(`http://127.0.0.1:${port}`);
    session.defaultSession.setPermissionRequestHandler(
        (wc, permission, callback) => {
            callback(permission === 'media' && isLocalOrigin(wc));
        },
    );
    session.defaultSession.setPermissionCheckHandler(
        (wc, permission) => permission === 'media' && isLocalOrigin(wc),
    );
    // First run (or config predating the captions window): default to the
    // full primary display work area so subtitles span the screen by default.
    if (!config.data.captions) {
        const wa = screen.getPrimaryDisplay().workArea;
        config.data.captions = {
            x: wa.x,
            y: wa.y,
            width: wa.width,
            height: wa.height,
            fontSize: 48,
            enabled: true,
        };
        config.save();
    } else if (config.data.captions.enabled === undefined) {
        // Configs written before the toggle existed: keep captions shown.
        config.data.captions.enabled = true;
        config.save();
    }
    petWindow = new PetWindow(port, config.data.window);
    petWindow.create();
    const captionsWindow = new CaptionsWindow(port, config.data.captions);
    captionsWindow.create();
    const settingsWindow = new SettingsWindow(port);

    // Route caption/pipeline events to every window that shows them; toasts
    // stay on the pet window so errors do not plaster the whole screen.
    // The pipeline ends every utterance (reply, skip, or error) with ttsEnd,
    // so it is the per-utterance reset point for the ttsStart flag below.
    let ttsFirstChunk = true;
    const broadcast: WindowTarget = {
        send(channel: string, ...args: unknown[]): void {
            petWindow?.send(channel, ...args);
            if (channel !== CHANNELS.toast) {
                captionsWindow.send(channel, ...args);
            }
            if (channel === CHANNELS.ttsEnd) {
                ttsFirstChunk = true;
            }
        },
    };

    // The PCM chunk buffer is transferred to the pet renderer, so the
    // captions window gets a lightweight "playback started" signal on the
    // first chunk of each reply instead.
    const ttsClient = new TtsClient(
        config.data.tts,
        (f32) => {
            petWindow!.send(CHANNELS.ttsChunk, f32.buffer, [f32.buffer]);
            if (ttsFirstChunk) {
                ttsFirstChunk = false;
                captionsWindow.send(CHANNELS.ttsStart);
            }
        },
        toast,
    );
    const pipeline = new ConversationPipeline({
        stt: new SttClient(config.data.stt),
        llm: new LlmClient(config.data.llm),
        tts: ttsClient,
        window: broadcast,
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

    ipcMain.handle(CHANNELS.getWorkArea, () => {
        return screen.getPrimaryDisplay().workArea;
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
            const llmPatch = patch.llm;
            if (
                !llmPatch ||
                typeof llmPatch.model !== 'string' ||
                !llmPatch.model.trim() ||
                !Number.isInteger(llmPatch.maxTokens) ||
                llmPatch.maxTokens < 64 ||
                llmPatch.maxTokens > 131072 ||
                !Number.isFinite(llmPatch.temperature) ||
                llmPatch.temperature < 0 ||
                llmPatch.temperature > 2 ||
                typeof llmPatch.think !== 'boolean' ||
                !Number.isFinite(llmPatch.frequencyPenalty) ||
                llmPatch.frequencyPenalty < -2 ||
                llmPatch.frequencyPenalty > 2 ||
                !Number.isFinite(llmPatch.presencePenalty) ||
                llmPatch.presencePenalty < -2 ||
                llmPatch.presencePenalty > 2 ||
                !Number.isInteger(llmPatch.gpuLayers) ||
                llmPatch.gpuLayers < 0 ||
                llmPatch.gpuLayers > 999
            ) {
                throw new Error('invalid llm payload');
            }
            const c = patch.captions;
            if (
                !c ||
                ![c.x, c.y, c.width, c.height, c.fontSize].every(
                    Number.isFinite,
                ) ||
                typeof c.enabled !== 'boolean' ||
                c.width < 200 ||
                c.height < 100 ||
                c.fontSize < 12 ||
                c.fontSize > 400
            ) {
                throw new Error('invalid captions payload');
            }
            const pw = patch.petWindow;
            if (
                !pw ||
                ![pw.width, pw.height].every(Number.isInteger) ||
                pw.width < 100 ||
                pw.width > 4000 ||
                pw.height < 100 ||
                pw.height > 4000
            ) {
                throw new Error('invalid pet window payload');
            }
            // App-level settings: persist in config.json, independent of the
            // active character. Language is applied per request by the
            // clients; only a TTS model or LLM model/GPU change needs a
            // server restart.
            const prevTtsModel = config.data.tts.model;
            const prevLlmModel = config.data.llm.model;
            const prevGpuLayers = config.data.llm.gpuLayers;
            config.data.stt.language = lang.stt;
            config.data.tts.language = lang.tts;
            config.data.tts.model = patch.ttsModel;
            config.data.llm.model = llmPatch.model.trim();
            config.data.llm.maxTokens = llmPatch.maxTokens;
            config.data.llm.temperature = llmPatch.temperature;
            config.data.llm.think = llmPatch.think;
            config.data.llm.frequencyPenalty = llmPatch.frequencyPenalty;
            config.data.llm.presencePenalty = llmPatch.presencePenalty;
            config.data.llm.gpuLayers = llmPatch.gpuLayers;
            Object.assign(config.data.captions, c);
            Object.assign(config.data.window, pw);
            config.save();
            captionsWindow.apply(config.data.captions);
            petWindow?.apply(config.data.window);
            let ttsRestarting = false;
            if (config.data.tts.model !== prevTtsModel) {
                ttsRestarting = true;
                toast('Switching TTS model… (~60s)');
                void ttsService.restart().catch((err) => {
                    console.error('[voice-box] TTS restart failed:', err);
                });
            }
            let llmRestarting = false;
            if (
                config.data.llm.model !== prevLlmModel ||
                config.data.llm.gpuLayers !== prevGpuLayers
            ) {
                llmRestarting = true;
                toast('Restarting LLM server…');
                void llamaService.restart().catch((err) => {
                    console.error('[voice-box] llama restart failed:', err);
                });
            }
            return { ok: true, ttsRestarting, llmRestarting };
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
            return { ok: true, ttsRestarting: false };
        }
        const ttsKey = (): string =>
            [
                config.data.tts.model,
                config.data.tts.voicesFile,
                config.data.tts.language,
            ].join('|');
        const prevTtsKey = ttsKey();
        // LLM settings are app-level, so switching characters never touches
        // llama-server — only the voice (and avatar) can change.
        applyCharacter(config.data, next);
        config.save();
        const ttsRestarting = ttsKey() !== prevTtsKey;
        petWindow?.send(CHANNELS.avatarChanged, config.data.image);
        if (ttsRestarting) {
            toast('Switching voice…');
            void ttsService.restart().catch((err) => {
                console.error('[voice-box] TTS restart failed:', err);
            });
        }
        return { ok: true, ttsRestarting };
    });
    ipcMain.on(CHANNELS.speechAudio, (_e, audio: Float32Array) => {
        captionsWindow.send(CHANNELS.speechStart);
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