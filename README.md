<p align="center">
  <img src="assets/deskmate.webp" width="160" alt="Deskmate" />
</p>

# Deskmate

<p align="center">
    <img src="https://img.shields.io/badge/Electron-Enabled-47848F?logo=electron&logoColor=white" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=TypeScript&logoColor=white" />
    <img src="https://img.shields.io/badge/whisper.cpp-STT-9cf" />
    <img src="https://img.shields.io/badge/llama.cpp-LLM-blue" />
    <img src="https://img.shields.io/badge/faster--qwen3--tts-voice%20clone-critical" />
    <img src="https://img.shields.io/badge/privacy-100%25%20local-brightgreen" />
</p>

<p align="center">
  <b> An always-listening desktop companion powered entirely by local
  models. </b>
</p>

------------------------------------------------------------------------

## Table of Contents

-   [About The Project](#about-the-project)
-   [Features](#features)
-   [Tech Stack](#tech-stack)
-   [Installation](#installation)
-   [Usage](#usage)
-   [Characters](#characters)
-   [Troubleshooting](#troubleshooting)
-   [Contributing](#contributing)

------------------------------------------------------------------------

## About The Project

**Deskmate** is an always-listening desktop companion built with
**Electron**. It lives as a small floating PNG on top of everything, with no
title bar and no buttons. Click its face once to start the mic, then just
talk: it hears you (Silero VAD), transcribes locally (whisper.cpp), thinks
(llama.cpp), and answers out loud in your character's cloned voice
(faster-qwen3-tts), brightening the image while it speaks. The conversation
shows up as subtitles in a separate transparent, click-through window that can
span the whole screen.

A character is a folder: icon, reference voice, and persona. The repo ships
with `momo` and `amadeus`; drop a new folder into `characters/` and it appears
in Settings.

Everything runs on your machine. No cloud, no API keys.

This project is ideal for:

-   Desktop pets and ambient companions that talk back
-   Local-first voice AI that runs fully offline
-   Voice-pipeline experiments (VAD → STT → LLM → TTS as swappable local
    services)

------------------------------------------------------------------------

## Features

-   Always listening (Silero VAD)
-   Local speech-to-text (whisper.cpp, Japanese by default)
-   Local brain (llama.cpp with a 2B Qwen3.5 model, GPU-offloaded)
-   Cloned-voice replies (faster-qwen3-tts)
-   Subtitles anywhere (transparent click-through captions with bouncing dots)
-   Drop-in characters, no restart needed
-   Long-term memory (per-character vector store, memories injected into every
    prompt)
-   Self-managing services (starts or reuses whisper-server, llama-server, and
    the TTS server)

------------------------------------------------------------------------

## Tech Stack

-   Electron + Node.js + TypeScript
-   Silero VAD (`@ricky0123/vad-web`)
-   whisper.cpp
-   llama.cpp
-   faster-qwen3-tts
-   LangChain.js + transformers.js (memory)

------------------------------------------------------------------------

## Installation

### 1. Clone the Repository

```
git clone https://github.com/vunguyen312/voice-box.git
cd voice-box
```

### 2. Install Dependencies

```
npm install
```

### 3. Set Up the Local Services

Deskmate speaks to three local services and never starts them if yours are
already running. Each binary is looked up on `PATH`, `~/.local/bin`, or
`voice-box/vendor/<name>/`. If you do not have one, drop a prebuilt release
from the upstream project there:

-   **STT**: whisper.cpp's `whisper-server`
-   **LLM**: llama.cpp's `llama-server`
-   **TTS**: the Python server in `voice/` (see its README), run from the GPU
    venv at the repo root

The models are never downloaded by the app. Install them once into `models/`:

-   The STT model named by `config.stt.model`
    (`voice-box/models/ggml-small.bin`):

    ```sh
    curl -L -o voice-box/models/ggml-small.bin \
      https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
    ```

-   The GGUF named by `config.llm.model`
    (`voice-box/models/<base>-<quant>.gguf`).

------------------------------------------------------------------------

## Usage

```
npm start     # builds the renderer bundle, then launches Electron
```

Once launched:

1.  Click anywhere on the box once to start the microphone
2.  Talk to it

The first launch is slow by design: the TTS model takes ~45s to load (a toast
shows progress) and the STT model a few seconds, while llama-server boots in
~1s. Set `llm.spawn`/`tts.spawn` to `false` in `config.json` to disable
auto-starting a service.

------------------------------------------------------------------------

## Characters

Every folder under `characters/` is a companion the app can run as:

| File | Meaning |
|---|---|
| `icon.png` | The pet image itself |
| reference audio | The voice to clone (e.g. `momo.wav`) |
| `character.json` | `name`, `description`, and `systemPrompt` persona (all but `name` optional) |
| `voices.json` | TTS voice config; the first voice wins |

Pick one in Settings → Characters, or use **Open folder** to drop a new
character in. It appears as soon as the settings window regains focus. The
avatar is the `icon` image (any format; scaled to the window). Language, the
TTS model, and all LLM settings are app-level in `config.json`. Characters
never override them.

------------------------------------------------------------------------

## Troubleshooting

-   **Service not found.** The toast names it. `whisper-server` and
    `llama-server` must be on `PATH` or in `voice-box/vendor/`.
-   **Model not found.** Install the STT model and GGUF into `models/`,
    matching `config.stt.model` and `config.llm.model`. The app never
    downloads them.
-   **No speech detected.** Click the box once to grant the microphone. In a
    WSL2 VM with no audio input, use `debug.autoSendWav` to exercise the full
    chain on any machine.
-   **Port conflicts.** Change `stt.url`, `tts.url`, or `llm.baseUrl` in
    `config.json`.

------------------------------------------------------------------------

## Contributing

Contributions are welcome.

1.  Fork the repository
2.  Create a new branch
3.  Commit your changes
4.  Push to your branch
5.  Open a pull request
