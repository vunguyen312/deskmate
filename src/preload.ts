import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type VoiceBoxApi } from '../shared/contract';

const api: VoiceBoxApi = {
    getConfig: () => {
        return ipcRenderer.invoke(CHANNELS.getConfig);
    },
    sendSpeech: (audio) => {
        ipcRenderer.send(CHANNELS.speechAudio, audio);
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
};

contextBridge.exposeInMainWorld('api', api);