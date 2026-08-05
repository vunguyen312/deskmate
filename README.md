# Voice Box

An always-listening Electron companion that lives as a small floating PNG on top of
everything. It listens continuously (Silero VAD), transcribes locally (whisper.cpp),
runs the text through an LLM (llama.cpp, fully local), and speaks the
reply with the repo's faster-qwen3-tts voice clone (`momo`), brightening the image while
it talks. Your words and the reply are shown as subtitles at the bottom edge (white with
a black outline, no background), with three bouncing dots while the LLM has not replied
with audio yet. No title bar, no buttons — the image is the app. Drag it around by its face,
right-click (or Ctrl+Q) to quit.

```
mic ──▶ VAD (renderer, @ricky0123/vad-web) ──▶ dist/main.js ──▶ STT (whisper.cpp, :8002)
                                                              │
                                                              ▼
                                                     LLM (llama.cpp :8081)
                                                              │
                                                              ▼
        image brightens ◀── playback (renderer) ◀── TTS (faster-qwen3-tts, :8001)
```

## Prerequisites

- Node.js (for npm/Electron).
- The GPU venv (`.venv/`) with the TTS dependencies already installed.
- Python services run from the `voice/` Python project (the venv lives at the repo root):
  - The TTS server (`voice/server/openai_server.py`) uses `faster-qwen3-tts`; nothing
    in voice-box needs CUDA 12 packages anymore — the whole stack is CUDA 13.
- whisper.cpp's `whisper-server`, found on `PATH`, `~/.local/bin`, or
  `voice-box/vendor/whisper/`. Either drop a prebuilt release from
  github.com/ggml-org/whisper.cpp/releases there, or build one with CUDA support
  (this repo's `voice-box/vendor/whisper/` ships a CUDA build):

  ```sh
  git clone --depth 1 --branch v1.9.2 https://github.com/ggerganov/whisper.cpp /tmp/whisper.cpp
  cmake -B /tmp/whisper.cpp/build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86 \
        -DCMAKE_BUILD_TYPE=Release
  cmake --build /tmp/whisper.cpp/build --target whisper-server -j 8
  # then copy build/bin/whisper-server + build/bin/*.so* flat into voice-box/vendor/whisper/
  ```

  > On glibc ≥ 2.41 (Ubuntu 26.04+), CUDA ≥ 13.2 headers are required — CUDA
  > 13.1's math declarations conflict with glibc's C23 `rsqrt` when compiling
  > with `_GNU_SOURCE` (which nvcc defines implicitly).

  The multilingual model named by `config.stt.model` must already be installed at
  `voice-box/models/ggml-small.bin` (`ggml-<model>.bin` for other sizes) — the app
  never downloads it. Fetch it once with:

  ```sh
  curl -L -o voice-box/models/ggml-small.bin \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
  ```

- llama.cpp's `llama-server`, found on `PATH`, `~/.local/bin`, or
  `voice-box/vendor/llama/`. Either drop a prebuilt release from
  github.com/ggml-org/llama.cpp/releases there, or build one with CUDA support
  (this repo's `voice-box/vendor/llama/` ships a CUDA build):

  ```sh
  git clone --depth 1 --branch b10275 https://github.com/ggml-org/llama.cpp /tmp/llama.cpp
  cmake -B /tmp/llama.cpp/build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86 \
        -DCMAKE_BUILD_TYPE=Release -DLLAMA_CURL=OFF
  cmake --build /tmp/llama.cpp/build --target llama-server -j 8
  # then copy build/bin/llama-server + build/bin/*.so* flat into voice-box/vendor/llama/
  ```

  > On glibc ≥ 2.41 (Ubuntu 26.04+), CUDA ≥ 13.2 headers are required — CUDA
  > 13.1's math declarations conflict with glibc's C23 `rsqrt` when compiling
  > with `_GNU_SOURCE` (which nvcc defines implicitly).

  The GGUF named by `config.llm.model` must already be installed at
  `voice-box/models/<base>-<quant>.gguf` — the app never downloads it.

  > Thinking models (qwen3, qwen3.5): the shipped config keeps reasoning off
  > (`llm.think: false`) for fast replies; `llm.frequencyPenalty`/
  > `llm.presencePenalty` suppress the repetition loops small quantized models
  > fall into. Enabling `llm.think: true` makes a 2B model reason verbosely —
  > replies cost ~2.5–3.5k tokens (~5–12s on a 3080-class GPU) — and
  > `llm.maxTokens` must stay high, or the model spends the whole budget
  > thinking and returns an empty reply.

  Everything stays on your machine: no cloud endpoint, no API key.

## Run

```sh
cd voice-box
npm install
npm start        # builds the renderer bundle, then launches Electron
```

The app manages its own services: it starts the STT service (whisper-server, port
from `stt.url`), the TTS server (`voice/server/openai_server.py` with the `momo` voice,
port from `tts.url`), and `llama-server` (bound to `llm.baseUrl`, when that host is
localhost) — but only if they are not already running; your own instances are
detected and reused. If a service is already up on its port, the app just talks to
it. llama-server boots in ~1s and loads the 2B model in a few seconds (unlike
ollama). First launches are slow by design: the TTS model takes ~45s to load (a toast
shows progress; the TTS server captures its CUDA graphs at load, so the first reply is already fast), the
STT model takes a few seconds to load. Set
`llm.spawn`/`tts.spawn` to `false` to disable auto-starting.

1. Click anywhere on the box once (starts the microphone), then talk to it in Japanese.

## Configuration (`voice-box/config.json`)

`config.json` is the single source of configuration — the app embeds no defaults.

| Key | Default | Meaning |
|---|---|---|
| `llm.baseUrl` | `http://127.0.0.1:8081` | llama-server base URL (llama.cpp's stock port is 8080; voice-box defaults to 8081 to avoid common collisions) |
| `llm.model` | `"unsloth/Qwen3.5-2B-GGUF:Q4_K_S"` | `<repo>:<quant>` naming the pre-installed GGUF at `voice-box/models/<base>-<quant>.gguf` — no download, that file must exist |
| `llm.systemPrompt` | モモ prompt | Persona; change to any language you want the replies in |
| `llm.maxTokens` / `llm.temperature` | `4096` / `0.7` | Generation knobs (qwen3.5's thinking needs ~2.5–3.5k tokens per reply — too low yields empty replies) |
| `llm.think` | `false` | Thinking for qwen3.5 models (`chat_template_kwargs.enable_thinking`); `true` = reasoned replies, but slow on a 2B (~5–12s each) |
| `llm.frequencyPenalty` / `llm.presencePenalty` | `0.5` / `0.3` | OpenAI-style repetition suppression (applies to answers and reasoning; keeps small models from looping) |
| `llm.gpuLayers` | `99` | llama.cpp `-ngl` GPU offload; set `0` for CPU-only llama.cpp builds (llama.cpp falls back to CPU automatically when no GPU backend is present) |
| `llm.spawn` | `true` | Auto-start `llama-server` (bound to `llm.baseUrl`) when nothing answers there; local hosts only |
| `tts.spawn` | `true` | Auto-start the TTS server (repo venv, `momo` voice, port from `tts.url`) when it is not running |
| `stt.url` | `http://127.0.0.1:8002` | STT service URL (port is also used for the auto-spawned server) |
| `stt.model` | `"small"` | whisper.cpp model size (multilingual); maps to `voice-box/models/ggml-<model>.bin` |
| `stt.language` | `"ja"` | Source language (`"ja"`, `"en"`, …; omit for auto-detect) |
| `tts.url` | `http://127.0.0.1:8001` | TTS server URL |
| `tts.voice` | `"momo"` | Voice name from the TTS `--voices` file |
| `tts.responseFormat` | `"pcm"` | `"pcm"` (streamed) or `"wav"` |
| `vad.threshold` | `0.5` | Silero VAD sensitivity (`positiveSpeechThreshold`) |
| `image` | `"assets/momo.png"` | PNG path, relative to `voice-box/` |
| `window.width/height` | `300` | Window size in px |
| `debug.autoSendWav` | `""` | Absolute path to a WAV fed through the full pipeline on startup (dev, no mic needed) |

Replace `assets/momo.png` with your own transparent PNG (any size; it is scaled to the
window).

## Troubleshooting

- A toast names whichever service is down and how to start it. Services are
  auto-started on launch when their port is empty (`llm.spawn`/`tts.spawn`); the
  toasts below only appear when auto-start is off or the launch itself failed:
  - **STT**: `whisper-server -m voice-box/models/ggml-small.bin --port 8002` (or let the app spawn it).
  - **TTS**: `.venv/bin/python voice/server/openai_server.py --voices voice/momo/voices.json --language Japanese --port 8001` (from `voice-box/`).
  - **LLM**: `llama-server` not found means llama.cpp isn't installed (see
    Prerequisites); a failed spawn toasts the reason. The model file must exist at
    `voice-box/models/<base>-<quant>.gguf` matching `llm.model` — the app never
    downloads it; change `llm.model` only if you install a different GGUF.
- **No speech detected**: click the box once to grant the microphone; VAD init retries on
  the next click. In a WSL2 VM without an audio input there is no mic — use
  `debug.autoSendWav` to exercise the full chain on any machine.
- **Port conflicts**: change `stt.url`/`tts.url`/`llm.baseUrl` in `config.json` (the
  spawned ports follow each service's URL; the STT spawn port follows `stt.url`).
- **VAD model assets** load locally from `node_modules` (served by the app itself) — no
  network needed after `npm install`.

## How the pieces talk

- Renderer (VAD + playback) → `dist/preload.js` bridge → `dist/main.js` (all HTTP).
- `speech-audio` IPC carries the 16 kHz Float32 utterance; main wraps it in a WAV header
  (same layout as `server/openai_server.py:_wav_header`), posts it to the STT service,
  asks the LLM, then streams the TTS PCM reply back as `tts-chunk` transferables while
  the image stays bright. One utterance at a time: while a reply plays, further speech
  is dropped.
