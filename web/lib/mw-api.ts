import { io, Socket } from "socket.io-client";
import {
  DEFAULT_MW_URL,
  STORAGE_KEY,
  type AuditEvent,
  type CheckinDisplay,
  type CheckinSubmitResult,
  type CheckinTicketView,
  type DemoConfig,
  type HealthResponse,
  type PublicSession,
  type QueueEntry,
  type SessionInputPayload,
  type SttResult,
} from "./types";
import { normalizeBase } from "./audio";

export type MwSocketHandlers = {
  onConnect?: (socket: Socket) => void;
  onDisconnect?: () => void;
  onError?: (err: Error) => void;
  onSessionUpdate?: (session: PublicSession) => void;
  onCheckinDisplay?: (display: CheckinDisplay) => void;
};

export function createMwApi(options: { baseUrl?: string } = {}) {
  let baseUrl = normalizeBase(
    options.baseUrl ??
      (typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MW_URL
        : DEFAULT_MW_URL),
    DEFAULT_MW_URL,
  );
  let socket: Socket | null = null;
  let joinedGate: string | null = null;

  function setBaseUrl(url: string) {
    baseUrl = normalizeBase(url, DEFAULT_MW_URL);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, baseUrl);
    }
    if (socket) {
      socket.disconnect();
      socket = null;
      joinedGate = null;
    }
  }

  function getBaseUrl() {
    return baseUrl;
  }

  async function tts(text: string, lang = "en") {
    const res = await fetch(`${baseUrl}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`TTS ${res.status}: ${errText.slice(0, 200)}`);
    }
    const contentType = res.headers.get("content-type") || "audio/mpeg";
    const buffer = await res.arrayBuffer();
    return { buffer, contentType };
  }

  async function stt(formData: FormData): Promise<SttResult> {
    const res = await fetch(`${baseUrl}/stt`, {
      method: "POST",
      body: formData,
    });
    const data = (await res.json().catch(() => ({}))) as SttResult;
    if (!res.ok) {
      throw new Error(`STT ${res.status}: ${JSON.stringify(data)}`);
    }
    return data;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: T | { raw: string } | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      data = { raw: text } as { raw: string };
    }
    if (!res.ok) {
      const errData = data as Record<string, unknown> | null;
      const err = new Error(
        (errData && (String(errData.message || errData.error))) ||
          `HTTP ${res.status}`,
      ) as Error & { status?: number; data?: unknown };
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data as T;
  }

  function demoConfig() {
    return request<DemoConfig>("GET", "/demo/config");
  }

  function saveSapProfile(profile: {
    plateNumber: string;
    name: string;
    phone: string;
  }) {
    return request<{ name: string; plate: string; phone: string }>(
      "POST",
      "/demo/sap-profile",
      profile,
    );
  }

  function resetDemo() {
    return request<{ deleted: number }>("POST", "/demo/reset", {});
  }

  function health() {
    return request<HealthResponse>("GET", "/health");
  }

  function plateRead(payload: { gateId: string; plateNumber: string }) {
    return request<{ accepted: boolean; plateNumber?: string; reason?: string }>(
      "POST",
      "/lpr/plate-read",
      payload,
    );
  }

  function queue() {
    return request<QueueEntry[]>("GET", "/queue");
  }

  function getAvailableSlots() {
    return request<{ available: number; activeClaims?: unknown[] }>(
      "GET",
      "/slots/available",
    );
  }

  function setAvailableSlots(available: number) {
    return request<{ available: number }>("PUT", "/slots/available", {
      available: Number(available),
    });
  }

  function freedBatch(count?: number) {
    const body = count != null ? { count: Number(count) } : {};
    return request<{
      requested: number;
      notified: number;
      available: number;
    }>("POST", "/slots/freed-batch", body);
  }

  function whatsappConfirm(payload: {
    entryId: string;
    slotId: string;
    plateNumber: string;
  }) {
    return request<unknown>("POST", "/notifications/whatsapp/confirm", payload);
  }

  function auditEvents(limit = 40) {
    return request<AuditEvent[]>("GET", `/audit/events?limit=${limit}`);
  }

  function sessionInput(sessionId: string, payload: SessionInputPayload) {
    return request<PublicSession>(
      "POST",
      `/session/${sessionId}/input`,
      payload,
    );
  }

  function sessionStart(gateId: string) {
    return request<PublicSession>("POST", "/session/start", { gateId });
  }

  function checkinDisplay(gateId: string) {
    return request<CheckinDisplay>(
      "GET",
      `/checkin/display/${encodeURIComponent(gateId)}`,
    );
  }

  function checkinTicket(token: string, gateId?: string) {
    const q = gateId
      ? `?gateId=${encodeURIComponent(gateId)}`
      : "";
    return request<CheckinTicketView>(
      "GET",
      `/checkin/tickets/${encodeURIComponent(token)}${q}`,
    );
  }

  function checkinSubmit(payload: {
    token?: string;
    gateId: string;
    plateNumber: string;
    name: string;
    phone: string;
  }) {
    return request<CheckinSubmitResult>("POST", "/checkin/submit", payload);
  }

  function connectSocket(handlers: MwSocketHandlers = {}) {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    socket = io(`${baseUrl}/kiosk`, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
    socket.on("connect", () => handlers.onConnect?.(socket!));
    socket.on("disconnect", () => {
      joinedGate = null;
      handlers.onDisconnect?.();
    });
    socket.on("connect_error", (err) =>
      handlers.onError?.(err instanceof Error ? err : new Error(String(err))),
    );
    socket.on("session.update", (data: PublicSession) =>
      handlers.onSessionUpdate?.(data),
    );
    socket.on("checkin.display", (data: CheckinDisplay) =>
      handlers.onCheckinDisplay?.(data),
    );
    return socket;
  }

  function joinGate(gateId: string, cb?: (ack: { ok?: boolean }) => void) {
    const g = (gateId || "gate-1").trim();
    if (!socket?.connected) {
      cb?.({ ok: false });
      return;
    }
    socket.emit("kiosk.join", { gateId: g }, (ack: { ok?: boolean }) => {
      if (ack?.ok) joinedGate = g;
      cb?.(ack);
    });
  }

  function emitSessionInput(sessionId: string, payload: SessionInputPayload) {
    return new Promise<PublicSession>((resolve, reject) => {
      if (!socket?.connected) {
        sessionInput(sessionId, payload).then(resolve).catch(reject);
        return;
      }
      socket.emit(
        "session.input",
        { ...payload, sessionId },
        (ack: { ok?: boolean; session?: PublicSession }) => {
          if (!ack?.ok || !ack.session) {
            reject(new Error(JSON.stringify(ack || { error: "no_ack" })));
            return;
          }
          resolve(ack.session);
        },
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

  function connectLogsSocket(mwUrl?: string) {
    const url = normalizeBase(mwUrl ?? baseUrl, DEFAULT_MW_URL);
    return io(`${url}/logs`, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }

  return {
    setBaseUrl,
    getBaseUrl,
    tts,
    stt,
    demoConfig,
    saveSapProfile,
    resetDemo,
    health,
    plateRead,
    queue,
    getAvailableSlots,
    setAvailableSlots,
    freedBatch,
    whatsappConfirm,
    auditEvents,
    sessionInput,
    sessionStart,
    checkinDisplay,
    checkinTicket,
    checkinSubmit,
    connectSocket,
    joinGate,
    emitSessionInput,
    getSocket,
    getJoinedGate,
    disconnect,
    connectLogsSocket,
  };
}

export type MwApi = ReturnType<typeof createMwApi>;
