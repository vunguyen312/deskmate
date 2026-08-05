import { app, ipcMain, session } from 'electron';
import * as path from 'node:path';
import { CHANNELS } from '../shared/contract';
import { Config } from './app/config';
import { scheduleAutoSendWav } from './dev/debug';
import { LlmClient } from './clients/llm-client';
import { APP_DIR } from './utils/paths';
import { ConversationPipeline } from './pipeline';
import type { ChildService } from './services/child-service';
import { LlamaService } from './services/llama-service';
import { SttService } from './services/stt-service';
import { TtsService } from './services/tts-service';
import { StaticServer } from './app/static-server';
import { SttClient } from './clients/stt-client';
import { TtsClient } from './clients/tts-client';
import { PetWindow } from './app/window';

if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-transparent-visuals');
}
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const config = new Config(path.join(APP_DIR, 'config.json'));

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