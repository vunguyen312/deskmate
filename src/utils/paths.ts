import * as path from 'node:path';

// Compiled output lives in dist/; these constants are anchored on the
// bundle location so they work no matter where the app is started from.
export const DIST_DIR = __dirname;
export const APP_DIR = path.resolve(__dirname, '..');
// The Python project (faster-qwen3-tts, server/) lives in voice/ inside the
// app directory; services spawn it from the app dir.
export const PRELOAD_PATH = path.join(DIST_DIR, 'preload.js');
// The GPU venv lives at the app level (voice-box/.venv), not inside voice/.
export const VENV_PYTHON = path.join(APP_DIR, '.venv', 'bin', 'python');
export const MODELS_DIR = path.join(APP_DIR, 'models');
export const VENDOR_DIR = path.join(APP_DIR, 'vendor');
