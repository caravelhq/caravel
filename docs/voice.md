# Voice — STT and TTS setup

Caravel's web dashboard has four voice features: dictation, two-way voice chat, voice task creation, and read-aloud. Two backends handle transcription; text-to-speech always uses DeepGram.

## Feature overview

| Control | What it does |
| --- | --- |
| **Mic** (microphone icon, dock) | Hold to dictate into whatever text field is focused on the page |
| **Walkie-talkie** (two-way arrows, dock) | Opens a full-screen voice conversation: hold to speak, release to send, Claude replies by voice as it streams |
| **Task-brief** (list-check icon, dock) | Hold to describe a task by voice; Claude extracts the fields and shows a confirmation card; tap Create to queue it |
| **Speaker** (volume icon, dock) | Reads any assistant message or report aloud |

The mic and speaker buttons are hidden while their respective features are disabled — enable them in the settings modal (see [In-app controls](#in-app-controls) below).

## Speech-to-text backends

Caravel routes STT through one of three backends, tried in this order:

1. **OpenAI-compatible API** (`stt.baseUrl` set) — routes to a locally-hosted faster-whisper or similar. No cloud key needed.
2. **DeepGram** (`deepGram.sttEnabled: true` + `deepGram.apiKey` set) — cloud STT using DeepGram's `nova-3` model.
3. **Bundled whisper.cpp** (default, no config needed) — local transcription using a pre-built `ggml-base.en` model downloaded on first use. Works immediately, no account required. Quality is lower than DeepGram nova-3 for accented speech or technical vocabulary.

## Text-to-speech

TTS is always DeepGram. It requires a valid `deepGram.apiKey`. Without a key, the speaker button and streaming voice replies are silently disabled.

## Getting a DeepGram API key

1. Create a free account at [deepgram.com](https://deepgram.com).
2. In the console, create a new project and generate an API key with **Usage** (listen + speak) permissions.
3. Copy the key — you only see it once.

## Configuring `.caravel/settings.json`

Edit `.caravel/settings.json` in your project root. The relevant block:

```json
{
  "deepGram": {
    "apiKey": "your-deepgram-api-key",
    "sttEnabled": true,
    "sttModel": "nova-3",
    "ttsModel": "aura-2-thalia-en"
  }
}
```

**Fields verified against `src/config.ts` and `src/whisper.ts`:**

| Key | Default | Description |
| --- | --- | --- |
| `deepGram.apiKey` | `""` | DeepGram API key. Required for STT (when `sttEnabled: true`) and for TTS. |
| `deepGram.sttEnabled` | `false` | Use DeepGram instead of local whisper.cpp for transcription. Ignored if `apiKey` is empty. |
| `deepGram.sttModel` | `"nova-3"` | DeepGram STT model passed to `POST /v1/listen`. |
| `deepGram.ttsModel` | `"aura-2-thalia-en"` | DeepGram TTS model passed to `POST /v1/speak`. See note on model naming below. |
| `stt.baseUrl` | `""` | Base URL of a local OpenAI-compatible STT server (e.g. `http://127.0.0.1:8000`). When set, takes priority over DeepGram STT and whisper.cpp. |
| `stt.model` | `""` | Model name sent to the local API. Defaults to `Systran/faster-whisper-large-v3` when blank. |

### TTS model naming

DeepGram's voice models follow the pattern `aura-2-<voice>-en`, for example:

- `aura-2-thalia-en` (default — neutral, clear)
- `aura-2-luna-en`
- `aura-2-zeus-en`

**Do not use `aura-2-en-us`** — that is the old, invalid format. The server auto-corrects it to `aura-2-thalia-en` if you accidentally set it, but setting the correct name directly avoids any ambiguity.

See the [DeepGram voice models docs](https://developers.deepgram.com/docs/tts-models) for the full list.

### Optional: OpenAI-compatible local STT

If you run a local STT server (e.g. [faster-whisper-server](https://github.com/fedirz/faster-whisper-server)):

```json
{
  "stt": {
    "baseUrl": "http://127.0.0.1:8000",
    "model": "Systran/faster-whisper-large-v3"
  }
}
```

This overrides both DeepGram and the bundled whisper.cpp binary for transcription. TTS still requires DeepGram.

## In-app controls

The settings modal (⚙ / gear icon) exposes three voice toggles without requiring a file edit:

| Toggle | What it controls |
| --- | --- |
| **Mic (STT)** — On/Off | Enables or disables all microphone-based features (dictation, voice chat, voice task creator). Hides the mic-group buttons when Off. |
| **Speaker (TTS)** — On/Off | Enables or disables read-aloud and streaming voice replies. Hides the speaker button when Off. |
| **STT provider** — Whisper / DeepGram | Switches transcription between local whisper.cpp and DeepGram. The DeepGram option only appears when an API key is configured. |

These toggles write back to `.caravel/settings.json` via `POST /api/settings/voice` and take effect immediately — no daemon restart needed.

## Restart note

Changes to `.caravel/settings.json` made by hand (outside the in-app toggles) require a daemon restart to take effect:

```bash
bash setup/restart-caravel.sh
```

The in-app toggles do not require a restart.
