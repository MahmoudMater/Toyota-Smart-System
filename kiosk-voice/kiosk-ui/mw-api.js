/**
 * Middleware UI service layer for the demo console.
 * All HTTP/Socket.io calls to NestJS go through here — page logic stays free of fetch URLs.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "tamkeen.demo.mwUrl";
  const VOICE_STORAGE_KEY = "tamkeen.demo.voiceUrl";
  const DEFAULT_MW = "http://127.0.0.1:3000";
  const DEFAULT_VOICE = "http://127.0.0.1:8080";

  function normalizeBase(url, fallback) {
    return String(url || fallback).replace(/\/$/, "");
  }

  function createMwApi(options = {}) {
    let baseUrl = normalizeBase(
      options.baseUrl || localStorage.getItem(STORAGE_KEY),
      DEFAULT_MW
    );
    let voiceUrl = normalizeBase(
      options.voiceUrl || localStorage.getItem(VOICE_STORAGE_KEY),
      DEFAULT_VOICE
    );
    let socket = null;
    let joinedGate = null;

    function setBaseUrl(url) {
      baseUrl = normalizeBase(url, DEFAULT_MW);
      localStorage.setItem(STORAGE_KEY, baseUrl);
      if (socket) {
        socket.disconnect();
        socket = null;
        joinedGate = null;
      }
    }

    function getBaseUrl() {
      return baseUrl;
    }

    function setVoiceUrl(url) {
      voiceUrl = normalizeBase(url, DEFAULT_VOICE);
      localStorage.setItem(VOICE_STORAGE_KEY, voiceUrl);
    }

    function getVoiceUrl() {
      return voiceUrl;
    }

    async function voiceHealth() {
      const res = await fetch(`${voiceUrl}/health`);
      if (!res.ok) throw new Error(`Voice HTTP ${res.status}`);
      return res.json();
    }

    async function tts(text, lang = "en") {
      const res = await fetch(`${voiceUrl}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`TTS ${res.status}: ${errText.slice(0, 200)}`);
      }
      return res.arrayBuffer();
    }

    async function stt(formData) {
      const res = await fetch(`${voiceUrl}/stt`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`STT ${res.status}: ${JSON.stringify(data)}`);
      }
      return data;
    }

    async function request(method, path, body) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body
          ? { "Content-Type": "application/json", Accept: "application/json" }
          : { Accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      if (!res.ok) {
        const err = new Error(
          (data && (data.message || data.error)) || `HTTP ${res.status}`
        );
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    }

    // --- Demo ---
    function demoConfig() {
      return request("GET", "/demo/config");
    }
    function saveSapProfile(profile) {
      return request("POST", "/demo/sap-profile", profile);
    }
    function resetDemo() {
      return request("POST", "/demo/reset", {});
    }

    // --- Business (reused) ---
    function health() {
      return request("GET", "/health");
    }
    function plateRead({ gateId, plateNumber }) {
      return request("POST", "/lpr/plate-read", { gateId, plateNumber });
    }
    function queue() {
      return request("GET", "/queue");
    }
    function slotFreed(slotId) {
      return request("POST", "/slots/freed", { slotId });
    }
    function getAvailableSlots() {
      return request("GET", "/slots/available");
    }
    function setAvailableSlots(available) {
      return request("PUT", "/slots/available", { available: Number(available) });
    }
    /** Free N slots → notify up to N waiting customers. */
    function freedBatch(count) {
      const body = count != null ? { count: Number(count) } : {};
      return request("POST", "/slots/freed-batch", body);
    }
    function whatsappConfirm({ entryId, slotId, plateNumber }) {
      return request("POST", "/notifications/whatsapp/confirm", {
        entryId,
        slotId,
        plateNumber,
      });
    }
    function auditEvents(limit = 40) {
      return request("GET", `/audit/events?limit=${limit}`);
    }
    function sessionInput(sessionId, payload) {
      return request("POST", `/session/${sessionId}/input`, payload);
    }
    function sessionStart(gateId) {
      return request("POST", "/session/start", { gateId });
    }

    // --- Socket.io ---
    function connectSocket(handlers = {}) {
      if (!global.io) {
        throw new Error("socket.io client not loaded");
      }
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      socket = global.io(`${baseUrl}/kiosk`, {
        transports: ["websocket", "polling"],
        autoConnect: true,
      });
      socket.on("connect", () => handlers.onConnect?.(socket));
      socket.on("disconnect", () => {
        joinedGate = null;
        handlers.onDisconnect?.();
      });
      socket.on("connect_error", (err) => handlers.onError?.(err));
      socket.on("session.update", (data) => handlers.onSessionUpdate?.(data));
      return socket;
    }

    function joinGate(gateId, cb) {
      const g = (gateId || "gate-1").trim();
      if (!socket?.connected) {
        cb?.({ ok: false, error: "not_connected" });
        return;
      }
      socket.emit("kiosk.join", { gateId: g }, (ack) => {
        if (ack?.ok) joinedGate = g;
        cb?.(ack);
      });
    }

    function emitSessionInput(sessionId, payload) {
      return new Promise((resolve, reject) => {
        if (!socket?.connected) {
          // REST fallback
          sessionInput(sessionId, payload).then(resolve).catch(reject);
          return;
        }
        socket.emit(
          "session.input",
          { ...payload, sessionId },
          (ack) => {
            if (!ack?.ok || !ack.session) {
              reject(new Error(JSON.stringify(ack || { error: "no_ack" })));
              return;
            }
            resolve(ack.session);
          }
        );
      });
    }

    function getSocket() {
      return socket;
    }

    function getJoinedGate() {
      return joinedGate;
    }

    function disconnect() {
      if (socket) {
        socket.disconnect();
        socket = null;
        joinedGate = null;
      }
    }

    return {
      setBaseUrl,
      getBaseUrl,
      setVoiceUrl,
      getVoiceUrl,
      voiceHealth,
      tts,
      stt,
      demoConfig,
      saveSapProfile,
      resetDemo,
      health,
      plateRead,
      queue,
      slotFreed,
      getAvailableSlots,
      setAvailableSlots,
      freedBatch,
      whatsappConfirm,
      auditEvents,
      sessionInput,
      sessionStart,
      connectSocket,
      joinGate,
      emitSessionInput,
      getSocket,
      getJoinedGate,
      disconnect,
    };
  }

  global.TamkeenMwApi = {
    createMwApi,
    DEFAULT_MW,
    DEFAULT_VOICE,
    STORAGE_KEY,
    VOICE_STORAGE_KEY,
  };
})(window);
