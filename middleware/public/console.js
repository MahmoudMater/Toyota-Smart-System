(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const api = window.TamkeenMwApi.createMwApi();

  const middlewareUrl = $("middlewareUrl");
  const gateId = $("gateId");
  const connectBtn = $("connectBtn");
  const resetBtn = $("resetBtn");
  const refreshBtn = $("refreshBtn");
  const configStatus = $("configStatus");
  const connDot = $("connDot");
  const connLabel = $("connLabel");

  const sapName = $("sapName");
  const sapPhone = $("sapPhone");
  const sapPlate = $("sapPlate");
  const saveSapBtn = $("saveSapBtn");
  const sapStatus = $("sapStatus");

  const lprPlate = $("lprPlate");
  const sendLprBtn = $("sendLprBtn");
  const copyPlateBtn = $("copyPlateBtn");
  const lprStatus = $("lprStatus");

  const promptText = $("promptText");
  const sessionStatus = $("sessionStatus");
  const profileBox = $("profileBox");
  const profileName = $("profileName");
  const profilePlate = $("profilePlate");
  const profilePhone = $("profilePhone");
  const yesBtn = $("yesBtn");
  const noBtn = $("noBtn");
  const recordBtn = $("recordBtn");
  const recordStatus = $("recordStatus");
  const keypadSection = $("keypadSection");
  const phoneInput = $("phoneInput");
  const submitPhoneBtn = $("submitPhoneBtn");
  const clearPhoneBtn = $("clearPhoneBtn");
  const keypad = $("keypad");
  const ttsAudio = $("ttsAudio");
  const avatarStatus = $("avatarStatus");

  const freeSlotBtn = $("freeSlotBtn");
  const saveSlotsBtn = $("saveSlotsBtn");
  const availableSlots = $("availableSlots");
  const slotsStatus = $("slotsStatus");
  const queueBody = $("queueBody");
  const queueStatus = $("queueStatus");
  const notifyBox = $("notifyBox");
  const claimsList = $("claimsList");
  const notifyStatus = $("notifyStatus");
  const chWa = $("chWa");
  const chSms = $("chSms");
  const chApp = $("chApp");
  const timeline = $("timeline");

  const avatar = new window.KioskAvatar.AvatarController({
    canvas: $("avatarCanvas"),
    riveCanvas: $("riveCanvas"),
    statusEl: avatarStatus,
    riveSrc: "./avatar.riv",
  });

  const beyVideo = $("beyVideo");
  const beyRoom = window.TamkeenBey?.createBeyRoomController({
    videoEl: beyVideo,
    statusEl: avatarStatus,
  });

  let sessionId = null;
  let sessionLang = "en";
  let sessionState = "idle";
  let avatarAdapter = "canvas";
  let claimTimeoutMs = 50_000;
  let activeClaims = []; // [{ entryId, slotId, plateNumber, notifiedAt }]
  let countdownTimer = null;
  let pollTimer = null;
  let speaking = false;
  let lastSpokenPrompt = "";
  let answerRecorder = null;
  let answerChunks = [];
  let answerStream = null;
  let answerRecording = false;
  let answerBusy = false;

  // Prefill URLs from storage
  middlewareUrl.value = api.getBaseUrl();

  // Keypad
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"].forEach((key) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = key;
    b.className = "secondary";
    b.addEventListener("click", () => {
      if (key === "⌫") phoneInput.value = phoneInput.value.slice(0, -1);
      else if (key === "✓") submitPhoneBtn.click();
      else phoneInput.value += key;
    });
    keypad.appendChild(b);
  });

  function setConn(ok, msg) {
    connDot.classList.toggle("on", !!ok);
    connLabel.textContent = msg;
  }

  function pickAudioMime() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const type of candidates) {
      if (window.MediaRecorder?.isTypeSupported?.(type)) return type;
    }
    return "";
  }

  async function ensureBeyRoom(data) {
    if (!beyRoom || data.avatar_adapter !== "bey" || !data.livekit?.token) {
      return false;
    }
    try {
      $("avatarCanvas")?.classList.add("hidden");
      $("riveCanvas")?.classList.add("hidden");
      beyRoom.showBey(true);
      await beyRoom.connect(data.livekit);
      return true;
    } catch (err) {
      console.warn("LiveKit connect failed, falling back to canvas TTS", err);
      beyRoom.showBey(false);
      $("avatarCanvas")?.classList.remove("hidden");
      avatarStatus.textContent = `bey fallback: ${err.message || err}`;
      return false;
    }
  }

  async function speakText(text, lang = sessionLang) {
    if (!text) return;
    speaking = true;
    avatar.setState("talking");
    try {
      const { buffer, contentType } = await api.tts(text, lang);
      await avatar.playWavAndLipSync(buffer, ttsAudio, contentType);
    } catch (err) {
      console.warn("TTS failed", err);
      sessionStatus.textContent = `TTS error: ${err.message || err}. Is the middleware running at ${api.getBaseUrl()}?`;
      avatar.setState("idle");
    } finally {
      speaking = false;
    }
  }

  function renderSession(data) {
    if (!data) return;
    sessionId = data.session_id;
    sessionLang = data.lang || "en";
    sessionState = data.state;
    avatarAdapter = data.avatar_adapter || "canvas";
    promptText.textContent = data.prompt || "";
    sessionStatus.textContent = JSON.stringify(
      {
        state: data.state,
        gate_id: data.gate_id,
        retries: data.retries,
        gate_open_stub: data.gate_open_stub,
        visit_phone: data.visit_phone,
        avatar_adapter: avatarAdapter,
        livekit_room: data.livekit?.room || null,
      },
      null,
      2
    );

    if (data.profile?.name) {
      profileBox.classList.remove("hidden");
      profileName.textContent = data.profile.name || "—";
      profilePlate.textContent = data.profile.plate || "—";
      profilePhone.textContent = data.profile.phone || "—";
    }

    const awaitingYesNo = [
      "awaiting_identity_confirm",
      "awaiting_owner_check",
      "awaiting_phone_confirm",
    ].includes(data.state);
    yesBtn.disabled = !awaitingYesNo;
    noBtn.disabled = !awaitingYesNo;
    recordBtn.disabled = ["done", "staff_escalation", "idle", "not_recognized"].includes(
      data.state
    );
    keypadSection.classList.toggle("hidden", data.state !== "awaiting_phone_speech");

    if (data.avatar_state && !speaking && avatarAdapter !== "bey") {
      avatar.setState(data.avatar_state);
    }
  }

  async function applyPromptSpeech(data) {
    if (!data?.prompt || data.prompt === lastSpokenPrompt) return;
    lastSpokenPrompt = data.prompt;

    const beyOk =
      data.avatar_adapter === "bey" ? await ensureBeyRoom(data) : false;

    if (beyOk) {
      // Nest already sent kiosk.speak to the LiveKit agent — wait for video audio.
      speaking = true;
      avatarStatus.textContent = "bey speaking…";
      // Rough settle; agent drives audio/video over LiveKit
      await new Promise((r) => setTimeout(r, 800));
      speaking = false;
    } else {
      await speakText(data.speech || data.prompt, data.lang || "en");
    }

    const listening = [
      "awaiting_identity_confirm",
      "awaiting_owner_check",
      "awaiting_phone_speech",
      "awaiting_phone_confirm",
    ];
    if (listening.includes(data.state) && !beyOk) avatar.setState("listening");
    else if (!beyOk) avatar.setState(data.avatar_state || "idle");
  }

  async function sendInput(payload) {
    if (!sessionId) return;
    try {
      const session = await api.emitSessionInput(sessionId, payload);
      renderSession(session);
      await applyPromptSpeech(session);
      void refreshAll();
      return session;
    } catch (err) {
      sessionStatus.textContent = String(err.message || err);
      throw err;
    }
  }

  function renderQueue(entries) {
    if (!entries?.length) {
      queueBody.innerHTML = `<tr><td colspan="5" class="status">Queue empty</td></tr>`;
      activeClaims = [];
      updateNotifyUi();
      return;
    }
    queueBody.innerHTML = entries
      .map((e, i) => {
        const status = e.status || "waiting";
        return `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(e.plateNumber || "")}</td>
          <td>${escapeHtml(e.phone || "")}</td>
          <td><span class="badge ${status}">${status}</span></td>
          <td>${escapeHtml(e.slotId || "—")}</td>
        </tr>`;
      })
      .join("");

    activeClaims = entries
      .filter((e) => e.status === "notified")
      .map((e) => ({
        entryId: e.id,
        slotId: e.slotId || "",
        plateNumber: e.plateNumber,
        notifiedAt: e.notifiedAt || new Date().toISOString(),
      }));
    updateNotifyUi();
  }

  function updateNotifyUi() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (!activeClaims.length) {
      notifyBox.classList.add("hidden");
      claimsList.innerHTML = "";
      chWa.classList.remove("active");
      chSms.classList.remove("active");
      chApp.classList.remove("active");
      notifyStatus.textContent =
        "No active claims — set available slots, then Free slots & notify.";
      return;
    }
    notifyBox.classList.remove("hidden");
    chWa.classList.add("active");
    chSms.classList.add("active");
    chApp.classList.add("active");
    notifyStatus.textContent = `${activeClaims.length} customer(s) notified on WhatsApp + SMS + App (dummy). Confirm each via WhatsApp or wait for timeout.`;
    claimsList.innerHTML = activeClaims
      .map(
        (c) => `<div class="claim-row" data-entry="${escapeHtml(c.entryId)}" style="margin:0.5rem 0;padding:0.5rem;border:1px solid var(--line);border-radius:8px">
          <div><strong>${escapeHtml(c.plateNumber)}</strong> · slot <code>${escapeHtml(c.slotId)}</code></div>
          <div class="countdown" data-countdown="${escapeHtml(c.entryId)}">—</div>
          <div class="actions">
            <button type="button" class="ok wa-confirm-btn"
              data-entry="${escapeHtml(c.entryId)}"
              data-slot="${escapeHtml(c.slotId)}"
              data-plate="${escapeHtml(c.plateNumber)}">WhatsApp confirm</button>
          </div>
        </div>`
      )
      .join("");
    startCountdowns();
  }

  function startCountdowns() {
    if (countdownTimer) clearInterval(countdownTimer);
    const tick = () => {
      for (const c of activeClaims) {
        const el = claimsList.querySelector(`[data-countdown="${CSS.escape(c.entryId)}"]`);
        if (!el) continue;
        const end = new Date(c.notifiedAt).getTime() + claimTimeoutMs;
        const left = Math.max(0, end - Date.now());
        el.textContent = `${Math.ceil(left / 1000)}s`;
        if (left <= 0) {
          el.textContent = "0s — shifting…";
        }
      }
      if (activeClaims.some((c) => Date.now() >= new Date(c.notifiedAt).getTime() + claimTimeoutMs)) {
        setTimeout(() => void refreshAll(), 600);
      }
    };
    tick();
    countdownTimer = setInterval(tick, 250);
  }

  function renderTimeline(events) {
    if (!events?.length) {
      timeline.innerHTML = `<div class="evt"><span class="meta">No events yet</span></div>`;
      return;
    }
    // events from API are newest-first
    timeline.innerHTML = events
      .map((e) => {
        const payload =
          typeof e.payload === "string"
            ? e.payload
            : JSON.stringify(e.payload ?? {}, null, 0);
        const short =
          payload.length > 160 ? payload.slice(0, 160) + "…" : payload;
        return `<div class="evt">
          <div class="name">${escapeHtml(e.event || "")}</div>
          <div class="meta">${escapeHtml(e.at || "")} · ${escapeHtml(e.id || "")}</div>
          <div class="meta">${escapeHtml(short)}</div>
        </div>`;
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function refreshAll() {
    try {
      const [q, audit, slots] = await Promise.all([
        api.queue(),
        api.auditEvents(40),
        api.getAvailableSlots().catch(() => null),
      ]);
      renderQueue(Array.isArray(q) ? q : []);
      renderTimeline(Array.isArray(audit) ? audit : []);
      if (slots && typeof slots.available === "number") {
        availableSlots.value = String(slots.available);
        slotsStatus.textContent = `Available free slots: ${slots.available} · active claims: ${(slots.activeClaims || []).length}`;
      }
      queueStatus.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      queueStatus.textContent = `Refresh error: ${err.message || err}`;
    }
  }

  async function connect() {
    api.setBaseUrl(middlewareUrl.value.trim());
    configStatus.textContent = "Connecting…";
    setConn(false, "Connecting…");
    try {
      const [health, cfg] = await Promise.all([
        api.health(),
        api.demoConfig(),
      ]);
      claimTimeoutMs = cfg.claimTimeoutMs || 50_000;
      configStatus.textContent =
        `OK · middleware ${health.service || "up"} · TTS=${health.tts_voices || "?"} · STT=${health.stt_model || "?"} · claim ${claimTimeoutMs / 1000}s`;

      api.connectSocket({
        onConnect: () => {
          setConn(true, `Socket connected`);
          api.joinGate(gateId.value.trim() || "gate-1", (ack) => {
            setConn(true, ack?.ok ? `Joined gate:${gateId.value.trim() || "gate-1"}` : "Join failed");
          });
        },
        onDisconnect: () => setConn(false, "Disconnected"),
        onError: (err) => setConn(false, `Socket error: ${err.message || err}`),
        onSessionUpdate: async (data) => {
          renderSession(data);
          await applyPromptSpeech(data);
          void refreshAll();
        },
      });

      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => void refreshAll(), 2000);
      await refreshAll();
    } catch (err) {
      configStatus.textContent =
        `Connect failed: ${err.message || err}. Middleware ${api.getBaseUrl()}`;
      setConn(false, "Failed");
    }
  }

  // --- Event handlers ---
  connectBtn.addEventListener("click", () => void connect());
  gateId.addEventListener("change", () => {
    if (api.getSocket()?.connected) {
      api.joinGate(gateId.value.trim() || "gate-1", (ack) => {
        setConn(!!ack?.ok, ack?.ok ? `Joined gate:${gateId.value.trim()}` : "Join failed");
      });
    }
  });

  refreshBtn.addEventListener("click", () => void refreshAll());

  resetBtn.addEventListener("click", async () => {
    resetBtn.disabled = true;
    try {
      api.setBaseUrl(middlewareUrl.value.trim());
      const r = await api.resetDemo();
      sessionId = null;
      lastSpokenPrompt = "";
      activeClaims = [];
      updateNotifyUi();
      promptText.textContent = "Demo reset. Save SAP profile → send LPR plate.";
      sessionStatus.textContent = "";
      profileBox.classList.add("hidden");
      yesBtn.disabled = true;
      noBtn.disabled = true;
      recordBtn.disabled = true;
      configStatus.textContent = `Reset OK — deleted ${r.deleted} keys`;
      await refreshAll();
    } catch (err) {
      configStatus.textContent = `Reset failed: ${err.message || err}`;
    } finally {
      resetBtn.disabled = false;
    }
  });

  saveSapBtn.addEventListener("click", async () => {
    saveSapBtn.disabled = true;
    try {
      api.setBaseUrl(middlewareUrl.value.trim());
      const profile = await api.saveSapProfile({
        plateNumber: sapPlate.value.trim(),
        name: sapName.value.trim(),
        phone: sapPhone.value.trim(),
      });
      sapStatus.textContent = `Saved: ${profile.name} / ${profile.plate} / ${profile.phone}`;
      lprPlate.value = profile.plate;
    } catch (err) {
      sapStatus.textContent = `Save failed: ${err.message || err}`;
    } finally {
      saveSapBtn.disabled = false;
    }
  });

  copyPlateBtn.addEventListener("click", () => {
    lprPlate.value = sapPlate.value.trim();
  });

  sendLprBtn.addEventListener("click", async () => {
    sendLprBtn.disabled = true;
    lastSpokenPrompt = "";
    try {
      api.setBaseUrl(middlewareUrl.value.trim());
      if (!api.getSocket()?.connected) await connect();
      else {
        api.joinGate(gateId.value.trim() || "gate-1");
      }
      const result = await api.plateRead({
        gateId: gateId.value.trim() || "gate-1",
        plateNumber: lprPlate.value.trim(),
      });
      lprStatus.textContent = result.accepted
        ? `Accepted plate ${result.plateNumber} — waiting for SAP → session push…`
        : `Rejected: ${result.reason || "deduped"} (reset demo if plate still active)`;
      setTimeout(() => void refreshAll(), 400);
    } catch (err) {
      lprStatus.textContent = `LPR failed: ${err.message || err}`;
    } finally {
      sendLprBtn.disabled = false;
    }
  });

  yesBtn.addEventListener("click", () => void sendInput({ source: "touch", choice: "yes" }));
  noBtn.addEventListener("click", () => void sendInput({ source: "touch", choice: "no" }));
  clearPhoneBtn.addEventListener("click", () => {
    phoneInput.value = "";
  });
  submitPhoneBtn.addEventListener("click", () =>
    void sendInput({ source: "touch", phone_digits: phoneInput.value })
  );

  saveSlotsBtn.addEventListener("click", async () => {
    saveSlotsBtn.disabled = true;
    try {
      const n = Number(availableSlots.value);
      const r = await api.setAvailableSlots(n);
      slotsStatus.textContent = `Saved available free slots: ${r.available}`;
    } catch (err) {
      slotsStatus.textContent = `Save failed: ${err.message || err}`;
    } finally {
      saveSlotsBtn.disabled = false;
    }
  });

  freeSlotBtn.addEventListener("click", async () => {
    freeSlotBtn.disabled = true;
    try {
      const n = Number(availableSlots.value);
      if (n > 0) {
        await api.setAvailableSlots(n);
      }
      const result = await api.freedBatch(n > 0 ? n : undefined);
      queueStatus.textContent = `Freed ${result.requested} slot(s) → notified ${result.notified}. Remaining available: ${result.available}`;
      availableSlots.value = String(result.available);
      setTimeout(() => void refreshAll(), 400);
    } catch (err) {
      queueStatus.textContent = `Free slots failed: ${err.message || err}`;
    } finally {
      freeSlotBtn.disabled = false;
    }
  });

  claimsList.addEventListener("click", async (ev) => {
    const btn = ev.target.closest?.(".wa-confirm-btn");
    if (!btn) return;
    btn.disabled = true;
    try {
      await api.whatsappConfirm({
        entryId: btn.dataset.entry,
        slotId: btn.dataset.slot,
        plateNumber: btn.dataset.plate,
      });
      notifyStatus.textContent = `Confirmed ${btn.dataset.plate} — assigning slot…`;
      setTimeout(() => void refreshAll(), 400);
    } catch (err) {
      notifyStatus.textContent = `Confirm failed: ${err.message || err}`;
      btn.disabled = false;
    }
  });

  // Hold-to-speak → STT on voice service → session.input on middleware
  async function startAnswerRecording(ev) {
    ev.preventDefault();
    if (answerBusy || answerRecording || recordBtn.disabled) return;
    if (!sessionId) {
      recordStatus.textContent = "No active session yet.";
      return;
    }
    try {
      answerStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      answerChunks = [];
      const mime = pickAudioMime();
      answerRecorder = mime
        ? new MediaRecorder(answerStream, { mimeType: mime })
        : new MediaRecorder(answerStream);
      answerRecorder.ondataavailable = (e) => {
        if (e.data.size) answerChunks.push(e.data);
      };
      answerRecorder.start(250);
      answerRecording = true;
      recordBtn.classList.add("ok");
      recordBtn.textContent = "Recording… release";
      recordStatus.textContent = "Listening…";
      avatar.setState("listening");
    } catch (err) {
      recordStatus.textContent = `Mic error: ${err.message || err}`;
    }
  }

  async function stopAnswerRecording(ev) {
    ev?.preventDefault?.();
    if (!answerRecording || !answerRecorder) return;
    answerRecording = false;
    answerBusy = true;
    recordBtn.textContent = "Hold to speak";
    recordBtn.classList.remove("ok");
    recordStatus.textContent = "Uploading to /stt…";
    try {
      await new Promise((resolve) => {
        answerRecorder.onstop = resolve;
        if (answerRecorder.state !== "inactive") answerRecorder.stop();
        else resolve();
      });
      answerStream?.getTracks().forEach((t) => t.stop());
      answerStream = null;
      if (!answerChunks.length) {
        recordStatus.textContent = "No audio captured.";
        return;
      }
      const type = answerRecorder.mimeType || "audio/webm";
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
      const blob = new Blob(answerChunks, { type });
      const form = new FormData();
      form.append("audio", blob, `answer.${ext}`);
      form.append("lang", "en");
      const sttData = await api.stt(form);
      recordStatus.textContent = `Heard: ${sttData.text || "(empty)"}`;
      const payload = { source: "stt", text: sttData.text };
      if (sttData.normalized === "yes" || sttData.normalized === "no") {
        payload.choice = sttData.normalized;
      }
      if (sttData.digits) payload.phone_digits = sttData.digits;
      await sendInput(payload);
    } catch (err) {
      recordStatus.textContent = `Error: ${err.message || err}`;
    } finally {
      answerBusy = false;
      answerRecorder = null;
      answerChunks = [];
    }
  }

  recordBtn.addEventListener("pointerdown", startAnswerRecording);
  recordBtn.addEventListener("pointerup", stopAnswerRecording);
  recordBtn.addEventListener("pointercancel", stopAnswerRecording);
  recordBtn.addEventListener("pointerleave", (ev) => {
    if (answerRecording) stopAnswerRecording(ev);
  });
  recordBtn.addEventListener("click", (ev) => ev.preventDefault());

  // Auto-connect on load
  void connect();
})();
