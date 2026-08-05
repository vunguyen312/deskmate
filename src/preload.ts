import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type CaptionWindowConfig, type VoiceBoxApi } from '../shared/contract';

const api: VoiceBoxApi = {
    getConfig: () => {
        return ipcRenderer.invoke(CHANNELS.getConfig);
    },
    sendSpeech: (audio) => {
        ipcRenderer.send(CHANNELS.speechAudio, audio);
    },
    onSpeechStart: (cb) => {
        ipcRenderer.on(CHANNELS.speechStart, () => {
            cb();
        });
    },
    onSttText: (cb) => {
        ipcRenderer.on(CHANNELS.sttText, (_e, text: string) => {
            cb(text);
        });
    },
    onLlmText: (cb) => {
        ipcRenderer.on(CHANNELS.llmText, (_e, text: string) => {
            cb(text);
        });
    },
    onTtsChunk: (cb) => {
        ipcRenderer.on(CHANNELS.ttsChunk, (_e, buf: ArrayBuffer) => {
            cb(buf);
        });
    },
    onTtsStart: (cb) => {
        ipcRenderer.on(CHANNELS.ttsStart, () => {
            cb();
        });
    },
    onTtsEnd: (cb) => {
        ipcRenderer.on(CHANNELS.ttsEnd, () => {
            cb();
        });
    },
    onToast: (cb) => {
        ipcRenderer.on(CHANNELS.toast, (_e, msg: string) => {
            cb(msg);
        });
    },
    onAppReady: (cb) => {
        ipcRenderer.on(CHANNELS.appReady, () => {
            cb();
        });
    },
    isAppReady: () => {
        return ipcRenderer.invoke(CHANNELS.appReadyQuery);
    },
    windowDragStart: () => {
        ipcRenderer.send(CHANNELS.windowDragStart);
    },
    windowDragMove: (dx, dy) => {
        ipcRenderer.send(CHANNELS.windowDragMove, dx, dy);
    },
    windowDragEnd: () => {
        ipcRenderer.send(CHANNELS.windowDragEnd);
    },
    quit: () => {
        ipcRenderer.send(CHANNELS.quit);
    },
    openSettings: () => {
        ipcRenderer.send(CHANNELS.openSettings);
    },
    openCharactersFolder: () => {
        ipcRenderer.send(CHANNELS.openCharactersFolder);
    },
    saveSettings: (patch) => {
        return ipcRenderer.invoke(CHANNELS.saveSettings, patch);
    },
    listCharacters: () => {
        return ipcRenderer.invoke(CHANNELS.listCharacters);
    },
    selectCharacter: (id) => {
        return ipcRenderer.invoke(CHANNELS.selectCharacter, id);
    },
    onAvatarChanged: (cb) => {
        ipcRenderer.on(CHANNELS.avatarChanged, (_e, image: string) => {
            cb(image);
        });
    },
    onCaptionsConfig: (cb) => {
        ipcRenderer.on(
            CHANNELS.captionsConfig,
            (_e, cfg: CaptionWindowConfig) => {
                cb(cfg);
            },
        );
    },
    getWorkArea: () => {
        return ipcRenderer.invoke(CHANNELS.getWorkArea);
    },
};

contextBridge.exposeInMainWorld('api', api);