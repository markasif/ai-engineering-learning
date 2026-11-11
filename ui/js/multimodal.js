/**
 * AskRaggy Enterprise Platform - Multimodal AI (Voice & Vision) Module
 */
import { state } from "./state.js";
import { showToast } from "./utils.js";
import { API_BASE, getAuthHeaders } from "./api.js";
import { appendMessage, sendMessage } from "./chat.js";

const voiceBtn = document.getElementById("voice-btn");
const voiceModal = document.getElementById("voice-modal");
const voiceTimer = document.getElementById("voice-timer");
const voiceStopBtn = document.getElementById("voice-stop-btn");
const voiceCancelBtn = document.getElementById("voice-cancel-btn");
const voiceStatusBar = document.getElementById("voice-status-bar");
const imageInput = document.getElementById("image-input");

let mediaRecorder = null;
let audioChunks = [];
let voiceTimerInterval = null;
let voiceStartTime = null;
let isVoiceCancelled = false;

export function startVoiceTimer() {
  voiceStartTime = Date.now();
  if (voiceTimer) voiceTimer.textContent = "00:00";
  clearInterval(voiceTimerInterval);
  voiceTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - voiceStartTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, "0");
    const s = (elapsed % 60).toString().padStart(2, "0");
    if (voiceTimer) voiceTimer.textContent = `${m}:${s}`;
  }, 1000);
}

export function stopVoiceTimer() {
  clearInterval(voiceTimerInterval);
  voiceTimerInterval = null;
}

/**
 * Start recording from the user's microphone via the MediaRecorder API.
 * Stores chunks in audioChunks; sendVoiceMessage() is called on dataavailable.
 */
export async function startVoiceRecording() {
  if (mediaRecorder) return;  // already recording

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    isVoiceCancelled = false;

    mediaRecorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    });

    mediaRecorder.addEventListener("stop", async () => {
      stopVoiceTimer();
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      stream.getTracks().forEach((t) => t.stop());  // release mic
      mediaRecorder = null;
      if (!isVoiceCancelled) {
        await sendVoiceMessage(blob);
      } else {
        if (voiceRecordingOverlay) voiceRecordingOverlay.style.display = "none";
        if (voiceBtn) voiceBtn.classList.remove("recording");
      }
    });

    mediaRecorder.start();

    // Show ChatGPT recording overlay
    if (voiceRecordingOverlay) {
      voiceRecordingOverlay.style.display = "flex";
    }
    if (voiceStatusTxt) voiceStatusTxt.textContent = "Listening…";
    if (voiceBtn) voiceBtn.classList.add("recording");
    startVoiceTimer();

  } catch (err) {
    showToast(`Microphone error: ${err.message}. Check browser permissions.`, "error");
  }
}

/** Stop an active recording and trigger sendVoiceMessage via the "stop" event. */
export function stopVoiceRecording(cancelled = false) {
  isVoiceCancelled = cancelled;
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  stopVoiceTimer();
  if (voiceRecordingOverlay) voiceRecordingOverlay.style.display = "none";
  if (voiceBtn) voiceBtn.classList.remove("recording");

  const activeInput = (document.getElementById("doc-chat-panel") && document.getElementById("doc-chat-panel").style.display !== "none")
    ? document.getElementById("doc-chat-input")
    : (document.getElementById("chat-input") || chatInput);

  if (cancelled) {
    showToast("Recording cancelled", "info");
    if (activeInput && activeInput.classList.contains("transcribing")) {
      activeInput.classList.remove("transcribing");
      activeInput.disabled = false;
      activeInput.value = "";
    }
  } else {
    // Show "Transcribing with ElevenLabs…" directly in the user input box
    if (activeInput) {
      activeInput.value = "Transcribing with ElevenLabs…";
      activeInput.disabled = true;
      activeInput.classList.add("transcribing");
    }
  }
}

/**
 * Send a recorded audio Blob to POST /api/voice/transcribe and handle the response.
 * Displays the transcribed speech inside the input box first,
 * then sends it as the user's message in chat, followed by the assistant response.
 *
 * @param {Blob} audioBlob - the recorded audio in WebM format
 */
export async function sendVoiceMessage(audioBlob) {
  const activeInput = (document.getElementById("doc-chat-panel") && document.getElementById("doc-chat-panel").style.display !== "none")
    ? document.getElementById("doc-chat-input")
    : (document.getElementById("chat-input") || chatInput);

  if (activeInput) {
    activeInput.value = "Transcribing with ElevenLabs…";
    activeInput.disabled = true;
    activeInput.classList.add("transcribing");
  }

  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/voice/transcribe`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();
    const transcript = (data.text || "").trim();

    if (!transcript) {
      if (activeInput) {
        activeInput.disabled = false;
        activeInput.classList.remove("transcribing");
        activeInput.value = "";
      }
      showToast("No speech detected. Please speak into the mic.", "info");
      return;
    }

    // 1. Put the transcribed text directly into the user input field
    if (activeInput) {
      activeInput.disabled = false;
      activeInput.classList.remove("transcribing");
      activeInput.value = transcript;
      activeInput.focus();
    }

    // 2. Brief visual pause (450ms) so user sees the speech translated into their input box
    await new Promise((r) => setTimeout(r, 450));

    // 3. Send message via standard pipeline:
    // User message bubble appears in chat FIRST, then assistant thinking bubble, then assistant answer!
    await sendMessage(transcript);

  } catch (err) {
    if (activeInput) {
      activeInput.disabled = false;
      activeInput.classList.remove("transcribing");
      activeInput.value = "";
    }
    showToast(`Voice error: ${err.message}`, "error");
    appendMessage("ai", `Voice error: ${err.message}. Check your ElevenLabs / STT settings in .env.`);
  } finally {
    if (voiceRecordingOverlay) voiceRecordingOverlay.style.display = "none";
    if (voiceBtn) voiceBtn.classList.remove("recording");
    if (activeInput && activeInput.classList.contains("transcribing")) {
      activeInput.disabled = false;
      activeInput.classList.remove("transcribing");
      activeInput.value = "";
    }
  }
}

/**
 * Decode base64 audio and play it in the browser.
 * @param {string} b64 - base64-encoded audio bytes
 * @param {string} mime - MIME type, e.g. "audio/mpeg"
 */
export function playBase64Audio(b64, mime = "audio/mpeg") {
  try {
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener("ended", () => URL.revokeObjectURL(url));
    audio.play().catch((e) => console.warn("Audio playback failed:", e));
  } catch (e) {
    console.warn("Could not decode/play audio:", e);
  }
}

// 🎤 button: toggle recording on/off.
voiceBtn?.addEventListener("click", () => {
  if (mediaRecorder) {
    stopVoiceRecording(false);
  } else {
    startVoiceRecording();
  }
});

// Stop and Cancel buttons in the ChatGPT recording overlay.
voiceStopBtn?.addEventListener("click", () => stopVoiceRecording(false));
voiceCancelBtn?.addEventListener("click", () => stopVoiceRecording(true));

/**
 * Send an image file to POST /api/vision/chat and show the result as a
 * visual card with a thumbnail and a VLM badge.
 *
 * @param {File} file - the image file from the file picker
 */
export async function sendImageMessage(file) {
  // Create a local object URL so we can show a thumbnail immediately.
  const thumbUrl = URL.createObjectURL(file);

  // Show the image attachment as a user bubble immediately!
  appendImageUserBubble(thumbUrl, file.name);
  const thinkingEl = appendMessage("ai", "", true);

  const userQuery = chatInput?.value?.trim() || "";
  if (chatInput) chatInput.value = "";
  const prompt = userQuery || `Describe this image in the context of ${currentDomainName || "enterprise documentation"}.`;

  const formData = new FormData();
  formData.append("image", file, file.name);
  formData.append("prompt", prompt);
  formData.append("detail", "auto");
  if (state.currentSessionId) formData.append("session_id", state.currentSessionId);

  const headers = {};
  if (activeTenantId) headers["X-Tenant-ID"] = activeTenantId;

  try {
    const res = await fetch(`${API_BASE}/api/vision/chat`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();
    thinkingEl.remove();

    // Show the vision response card.
    appendVisionResponse(data, thumbUrl);

    if (state.currentSessionId) loadSessions();
  } catch (err) {
    thinkingEl.remove();
    appendMessage("ai", `Vision error: ${err.message}.`);
  }
}

/**
 * Render the user's image upload as a bubble in the conversation.
 * @param {string} thumbUrl - object URL for thumbnail display
 * @param {string} filename - image filename
 */
export function appendImageUserBubble(thumbUrl, filename) {
  document.getElementById("empty-state")?.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "message user";

  const label = document.createElement("span");
  label.className = "role-label";
  label.textContent = "You";

  const bubble = document.createElement("div");
  bubble.className = "bubble image-bubble";
  bubble.innerHTML = `
    <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(filename)}" class="vision-thumb" />
    <span class="vision-filename">${escapeHtml(filename)}</span>
  `;

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);
  messageHistory.appendChild(wrapper);
  messageHistory.scrollTop = messageHistory.scrollHeight;
}

/**
 * Render a vision analysis response as a card with VLM badge.
 * @param {{ answer: string, model_used: string }} data
 * @param {string} thumbUrl - object URL for the thumbnail
 */
export function appendVisionResponse(data, thumbUrl) {
  document.getElementById("empty-state")?.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "message ai";

  const label = document.createElement("span");
  label.className = "role-label";
  label.style.display = "none";

  const card = document.createElement("div");
  card.className = "vision-response-card";

  card.innerHTML = `
    <div class="vision-response-header">
      <span class="vlm-badge">VLM</span>
      <span class="vision-model-tag">${escapeHtml(data.model_used ?? "vision model")}</span>
    </div>
    <p class="response-card-answer">${escapeHtml(data.answer ?? "")}</p>
  `;

  wrapper.appendChild(label);
  wrapper.appendChild(card);
  messageHistory.appendChild(wrapper);
  messageHistory.scrollTop = messageHistory.scrollHeight;
}

// 📷 image input handler.
imageInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) {
    sendImageMessage(file);
    imageInput.value = "";  // reset so the same file can be re-selected
  }
});



export function initMultimodal() {
  voiceBtn?.addEventListener("click", startVoiceRecording);
  voiceStopBtn?.addEventListener("click", stopVoiceRecording);
  voiceCancelBtn?.addEventListener("click", () => {
    isVoiceCancelled = true;
    stopVoiceRecording();
  });

  imageInput?.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (file) {
      sendImageMessage(file);
      imageInput.value = "";
    }
  });
}
