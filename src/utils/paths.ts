import * as path from 'node:path';

export const DIST_DIR = __dirname;
export const APP_DIR = path.resolve(__dirname, '..');

export const PRELOAD_PATH = path.join(DIST_DIR, 'preload.js');

export const VENV_PYTHON = path.join(APP_DIR, '.venv', 'bin', 'python');
export const MODELS_DIR = path.join(APP_DIR, 'models');
export const VENDOR_DIR = path.join(APP_DIR, 'vendor');
