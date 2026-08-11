(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const ttsText = $("ttsText");
  const speakBtn = $("speakBtn");
  const ttsAudio = $("ttsAudio");
  const ttsStatus = $("ttsStatus");
  const sttRecordBtn = $("sttRecordBtn");
  const sttStopBtn = $("sttStopBtn");
  const sttStatus = $("sttStatus");
  const startBtn = $("startBtn");
  const yesBtn = $("yesBtn");
  const noBtn = $("noBtn");
  const arBtn = $("arBtn");
  const enBtn = $("enBtn");
  const langButtons = $("langButtons");
  const gateId = $("gateId");
  const middlewareUrl = $("middlewareUrl");
  const socketStatus = $("socketStatus");
  const promptText = $("promptText");
  const sessionStatus = $("sessionStatus");
  const profileBox = $("profileBox");
  const profileName = $("profileName");
  const profilePlate = $("profilePlate");
  const profilePhone = $("profilePhone");
  const keypadSection = $("keypadSection");
  const phoneInput = $("phoneInput");
  const submitPhoneBtn = $("submitPhoneBtn");
  const clearPhoneBtn = $("clearPhoneBtn");
  const recordBtn = $("recordBtn");
  const recordStatus = $("recordStatus");
  const avatarStatus = $("avatarStatus");

  /** Voice service (this origin) — TTS/STT only. */
  const VOICE_BASE = "";

  const avatar = new window.KioskAvatar.AvatarController({
    canvas: $("avatarCanvas"),
    riveCanvas: $("riveCanvas"),
    statusEl: avatarStatus,
    riveSrc: "./avatar.riv",
  });

  const beyRoom = window.TamkeenBey?.createBeyRoomController({
    videoEl: $("beyVideo"),
    statusEl: avatarStatus,
  });

  let sessionId = null;
  let sessionLang = "en";
  let sessionState = "idle";
  let avatarAdapter = "canvas";
  let mediaRecorder = null;
  let sttChunks = [];
  let answerRecorder = null;
  let answerChunks = [];
  let answerStream = null;
  let answerRecording = false;
  let answerBusy = false;
  let socket = null;
  let joinedGate = null;

  function mwBase() {
    return (middlewareUrl?.value || "http://127.0.0.1:3000").replace(/\/$/, "");
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

  function setRecordStatus(msg) {
    if (recordStatus) recordStatus.textContent = msg;
  }

  function setSocketStatus(msg) {
    if (socketStatus) socketStatus.textContent = msg;
  }

  // Keypad
  const keypad = $("keypad");
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"].forEach((key) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = key;
    b.className = "secondary";
    b.addEventListener("click", () => {
      if (key === "⌫") {
        phoneInput.value = phoneInput.value.slice(0, -1);
      } else if (key === "✓") {
        submitPhoneBtn.click();
      } else {
        phoneInput.value += key;
      }
    });
    keypad.appendChild(b);
  });

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
      console.warn("LiveKit connect failed", err);
      beyRoom.showBey(false);
      $("avatarCanvas")?.classList.remove("hidden");
      avatarStatus.textContent = `bey fallback: ${err.message || err}`;
      return false;
    }
  }

  async function speakText(text, lang = sessionLang) {
    ttsStatus.textContent = `Synthesizing (${lang})…`;
    avatar.setState("talking");
    const res = await fetch(`${VOICE_BASE}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    if (!res.ok) {
      const err = await res.text();
      ttsStatus.textContent = `TTS error: ${res.status} ${err}`;
      avatar.setState("idle");
      throw new Error(err);
    }
    const buf = await res.arrayBuffer();
    const ct = res.headers.get("content-type") || "audio/mpeg";
    ttsStatus.textContent = `Audio ${buf.byteLength} bytes — playing`;
    await avatar.playWavAndLipSync(buf, ttsAudio, ct);
    ttsStatus.textContent = "Done";
  }

  function promptTtsLang(data) {
    return data.lang || sessionLang || "en";
  }

  function renderSession(data) {
    sessionId = data.session_id;
    sessionLang = data.lang || "en";
    sessionState = data.state;
    avatarAdapter = data.avatar_adapter || "canvas";
    promptText.textContent = data.prompt || "";
    document.body.classList.remove("rtl");
    document.documentElement.lang = "en";

    sessionStatus.textContent = JSON.stringify(
      {
        state: data.state,
        lang: data.lang,
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
    profileBox.classList.remove("hidden");
    profileName.textContent = data.profile?.name || "—";
    profilePlate.textContent = data.profile?.plate || "—";
    profilePhone.textContent = data.profile?.phone || "—";

    if (data.ui?.yes_label) yesBtn.textContent = data.ui.yes_label;
    if (data.ui?.no_label) noBtn.textContent = data.ui.no_label;

    const awaitingYesNo = [
      "awaiting_identity_confirm",
      "awaiting_owner_check",
      "awaiting_phone_confirm",
    ].includes(data.state);
    yesBtn.disabled = !awaitingYesNo;
    noBtn.disabled = !awaitingYesNo;

    arBtn.disabled = true;
    enBtn.disabled = true;
    langButtons.classList.add("hidden");

    recordBtn.disabled = ["done", "staff_escalation", "idle", "not_recognized"].includes(
      data.state
    );

    const needPhone = data.state === "awaiting_phone_speech";
    keypadSection.classList.toggle("hidden", !needPhone);

    if (avatarAdapter !== "bey") {
      if (data.avatar_state) {
        avatar.setState(data.avatar_state);
      } else if (needPhone) {
        avatar.setState("listening");
      } else if (
        data.state === "done" ||
        data.state === "staff_escalation" ||
        data.state === "not_recognized"
      ) {
        avatar.setState("idle");
      }
    }
  }

  async function applyPromptSpeech(data) {
    if (!data?.prompt) return;
    const beyOk =
      data.avatar_adapter === "bey" ? await ensureBeyRoom(data) : false;
    try {
      if (beyOk) {
        ttsStatus.textContent = "bey speaking (LiveKit)…";
        await new Promise((r) => setTimeout(r, 800));
      } else {
        await speakText(data.speech || data.prompt, promptTtsLang(data));
      }
    } catch (err) {
      console.warn("Prompt TTS failed", err);
      ttsStatus.textContent = `TTS error: ${err.message || err}`;
    }
    const listeningStates = [
      "awaiting_language",
      "awaiting_identity_confirm",
      "awaiting_owner_check",
      "awaiting_phone_speech",
      "awaiting_phone_confirm",
    ];
    if (!beyOk) {
      if (listeningStates.includes(data.state)) {
        avatar.setState("listening");
      } else {
        avatar.setState(data.avatar_state || "idle");
      }
    }
  }

  function ensureSocket() {
    if (!window.io) {
      setSocketStatus("Socket: socket.io client missing");
      return null;
    }
    const url = mwBase();
    if (socket && socket.io?.uri?.includes(url.replace(/^https?:\/\//, ""))) {
      return socket;
    }
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    socket = window.io(`${url}/kiosk`, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
    socket.on("connect", () => {
      setSocketStatus(`Socket: connected (${socket.id})`);
      joinGate();
    });
    socket.on("disconnect", () => {
      setSocketStatus("Socket: disconnected");
      joinedGate = null;
    });
    socket.on("connect_error", (err) => {
      setSocketStatus(`Socket: error ${err.message || err}`);
    });
    socket.on("session.update", async (data) => {
      renderSession(data);
      await applyPromptSpeech(data);
    });
    return socket;
  }

  function joinGate() {
    const g = gateId.value.trim() || "gate-1";
    if (!socket?.connected) return;
    socket.emit("kiosk.join", { gateId: g }, (ack) => {
      joinedGate = g;
      setSocketStatus(`Socket: joined gate:${g} ${ack?.ok ? "ok" : ""}`);
    });
  }

  gateId?.addEventListener("change", () => {
    if (socket?.connected) joinGate();
  });
  middlewareUrl?.addEventListener("change", () => {
    ensureSocket();
  });

  speakBtn.addEventListener("click", async () => {
    speakBtn.disabled = true;
    try {
      await speakText(ttsText.value.trim(), "en");
      avatar.setState("idle");
    } catch (err) {
      console.error(err);
    } finally {
      speakBtn.disabled = false;
    }
  });

  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    try {
      ensureSocket();
      joinGate();
      const res = await fetch(`${mwBase()}/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateId: gateId.value.trim() || "gate-1" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      renderSession(data);
      await applyPromptSpeech(data);
    } catch (err) {
      sessionStatus.textContent = String(err);
    } finally {
      startBtn.disabled = false;
    }
  });

  async function sendInput(payload) {
    if (!sessionId) return;
    ensureSocket();
    if (socket?.connected) {
      return new Promise((resolve, reject) => {
        socket.emit(
          "session.input",
          { ...payload, sessionId },
          async (ack) => {
            try {
              if (!ack?.ok || !ack.session) {
                reject(new Error(JSON.stringify(ack || { error: "no_ack" })));
                return;
              }
              renderSession(ack.session);
              await applyPromptSpeech(ack.session);
              resolve(ack.session);
            } catch (e) {
              reject(e);
            }
          }
        );
      });
    }
    // REST fallback when socket is down
    const res = await fetch(`${mwBase()}/session/${sessionId}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));
    renderSession(data);
    await applyPromptSpeech(data);
    return data;
  }

  yesBtn.addEventListener("click", () => sendInput({ source: "touch", choice: "yes" }));
  noBtn.addEventListener("click", () => sendInput({ source: "touch", choice: "no" }));
  arBtn.addEventListener("click", () =>
    sendInput({ source: "touch", language: "ar", choice: "ar" })
  );
  enBtn.addEventListener("click", () =>
    sendInput({ source: "touch", language: "en", choice: "en" })
  );
  clearPhoneBtn.addEventListener("click", () => {
    phoneInput.value = "";
  });
  submitPhoneBtn.addEventListener("click", () =>
    sendInput({ source: "touch", phone_digits: phoneInput.value })
  );

  sttRecordBtn.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sttChunks = [];
      const mime = pickAudioMime();
      mediaRecorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size) sttChunks.push(e.data);
      };
      mediaRecorder.start(250);
      sttStatus.textContent = "Recording…";
      sttRecordBtn.disabled = true;
      sttStopBtn.disabled = false;
      avatar.setState("listening");
    } catch (err) {
      sttStatus.textContent = `Mic error: ${err.message || err}. Allow microphone for this site.`;
    }
  });

  sttStopBtn.addEventListener("click", async () => {
    sttStopBtn.disabled = true;
    try {
      await new Promise((resolve) => {
        mediaRecorder.onstop = resolve;
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach((t) => t.stop());
      });
      const type = mediaRecorder.mimeType || "audio/webm";
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
      const blob = new Blob(sttChunks, { type });
      const form = new FormData();
      form.append("audio", blob, `clip.${ext}`);
      form.append("lang", "en");
      sttStatus.textContent =
        "Uploading / transcribing… (first Whisper load can take 1–3 minutes)";
      const res = await fetch(`${VOICE_BASE}/stt`, { method: "POST", body: form });
      const data = await res.json();
      sttStatus.textContent = res.ok
        ? JSON.stringify(data, null, 2)
        : `Error: ${JSON.stringify(data)}`;
    } catch (err) {
      sttStatus.textContent = `STT error: ${err.message || err}`;
    } finally {
      sttRecordBtn.disabled = false;
      avatar.setState("idle");
    }
  });

  async function startAnswerRecording(ev) {
    ev.preventDefault();
    if (answerBusy || answerRecording || recordBtn.disabled) return;
    if (!sessionId) {
      setRecordStatus("Start a visit first.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordStatus("This browser has no mic API. Use HTTPS/localhost and a modern browser.");
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
      recordBtn.textContent = "Recording… release to send";
      setRecordStatus("Listening — keep holding, then release to send.");
      avatar.setState("listening");
    } catch (err) {
      answerRecording = false;
      setRecordStatus(
        `Mic blocked or unavailable: ${err.message || err}. Check browser permission for microphone.`
      );
    }
  }

  async function stopAnswerRecording(ev) {
    ev?.preventDefault?.();
    if (!answerRecording || !answerRecorder) return;
    answerRecording = false;
    answerBusy = true;
    recordBtn.textContent = "Hold to record answer";
    recordBtn.classList.remove("ok");
    setRecordStatus("Stopping… uploading to /stt (first run may be slow)");

    try {
      await new Promise((resolve) => {
        answerRecorder.onstop = resolve;
        if (answerRecorder.state !== "inactive") answerRecorder.stop();
        else resolve();
      });
      answerStream?.getTracks().forEach((t) => t.stop());
      answerStream = null;

      if (!answerChunks.length) {
        setRecordStatus("No audio captured — hold longer while speaking.");
        return;
      }

      const type = answerRecorder.mimeType || "audio/webm";
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
      const blob = new Blob(answerChunks, { type });
      const form = new FormData();
      form.append("audio", blob, `answer.${ext}`);
      form.append("lang", "en");

      const sttRes = await fetch(`${VOICE_BASE}/stt`, { method: "POST", body: form });
      const sttData = await sttRes.json();
      if (!sttRes.ok) {
        setRecordStatus(`STT failed: ${JSON.stringify(sttData)}`);
        sessionStatus.textContent = `STT failed: ${JSON.stringify(sttData)}`;
        return;
      }

      setRecordStatus(`Heard: ${JSON.stringify(sttData)}`);
      const payload = { source: "stt", text: sttData.text };
      if (sttData.normalized === "yes" || sttData.normalized === "no") {
        payload.choice = sttData.normalized;
      }
      if (sttData.digits) payload.phone_digits = sttData.digits;
      await sendInput(payload);
      setRecordStatus(`Sent answer → next state. Last STT: ${sttData.text || "(empty)"}`);
    } catch (err) {
      setRecordStatus(`Record/send error: ${err.message || err}`);
      sessionStatus.textContent = String(err);
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

  // Connect on load
  ensureSocket();
})();
