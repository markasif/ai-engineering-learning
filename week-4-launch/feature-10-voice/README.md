# Feature 10: Voice + Vision

**Week 4 · Launch — Feature 10 of 12**

Your assistant gains ears and eyes. Users can speak their questions aloud and hear responses read back, and the assistant can understand images alongside text.

---

## New Concepts

| Concept | What it means |
|---|---|
| **STT (Speech-to-Text)** | Convert spoken audio → text; the model's "ears" |
| **TTS (Text-to-Speech)** | Convert text → spoken audio; the model's "voice" |
| **VLM (Vision Language Model)** | A model that understands images AND text together |
| **Multimodal** | Working with more than one type of input (text + audio + image) |
| **Whisper** | Open-weight STT model; fast and accurate; available via Groq (free) and locally via Ollama |

---

## New Endpoints

```
POST /api/voice/transcribe       → upload audio → returns text transcript
POST /api/voice/speak            → send text → returns audio file
POST /api/sessions/{id}/chat/voice → end-to-end: audio in, audio out
POST /api/vision/describe        → upload image → describe what's in it
POST /api/sessions/{id}/chat/vision → image + text question → answer
```

---

## Your Task

1. Set `STT_MODEL` and `VOICE_PROVIDER` in `.env`
2. Implement the `/api/voice/transcribe` endpoint (STT)
3. Implement the `/api/voice/speak` endpoint (TTS)
4. Wire up the end-to-end voice chat endpoint
5. (Optional) Set `VLM_PROVIDER` and `VLM_MODEL` and implement the vision endpoint
6. Test by recording a question in the UI and hearing the answer read back

---

## Environment Variables

```env
VOICE_PROVIDER=groq           # or openai — set in .env
STT_MODEL=whisper-large-v3    # Groq's fast, free Whisper endpoint
TTS_MODEL=                    # set if VOICE_PROVIDER=openai
VLM_PROVIDER=                 # optional: ollama (llava), openai (gpt-4o), etc.
VLM_MODEL=llava               # if using local Ollama vision
```

---

> **Coming next:** Feature 11 — Docker containerization and the path to a real URL.
