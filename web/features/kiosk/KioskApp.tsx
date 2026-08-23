"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { KioskAvatar, type KioskAvatarHandle } from "@/components/avatar/KioskAvatar";
import { HudPanel } from "@/components/ui/HudPanel";
import { GlowButton } from "@/components/ui/GlowButton";
import { HudInput, HudTextarea } from "@/components/ui/HudInput";
import { Keypad } from "@/components/ui/Keypad";
import { pickAudioMime } from "@/lib/audio";
import { createMwApi } from "@/lib/mw-api";
import { DEFAULT_MW_URL, STORAGE_KEY, type PublicSession, type SessionInputPayload } from "@/lib/types";

export function KioskApp() {
  const api = useMemo(() => createMwApi(), []);
  const avatarRef = useRef<KioskAvatarHandle>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [middlewareUrl, setMiddlewareUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MW_URL;
    }
    return DEFAULT_MW_URL;
  });
  const [gateId, setGateId] = useState("gate-1");
  const [socketStatus, setSocketStatus] = useState("Socket: disconnected");
  const [avatarStatus, setAvatarStatus] = useState("idle");
  const [session, setSession] = useState<PublicSession | null>(null);
  const [sessionStatus, setSessionStatus] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [recordStatus, setRecordStatus] = useState(
    "Mic answer: press and hold the button, speak, then release.",
  );
  const [ttsText, setTtsText] = useState(
    "Welcome to Toyota. Please confirm your identity.",
  );
  const [ttsStatus, setTtsStatus] = useState("");
  const [sttStatus, setSttStatus] = useState("Idle");
  const [yesLabel, setYesLabel] = useState("Yes");
  const [noLabel, setNoLabel] = useState("No");

  const sessionId = session?.session_id ?? null;
  const sessionState = session?.state ?? "idle";
  const sessionLang = session?.lang ?? "en";

  const answerRecorderRef = useRef<MediaRecorder | null>(null);
  const answerChunksRef = useRef<Blob[]>([]);
  const answerStreamRef = useRef<MediaStream | null>(null);
  const answerRecordingRef = useRef(false);
  const answerBusyRef = useRef(false);
  const sttRecorderRef = useRef<MediaRecorder | null>(null);
  const sttChunksRef = useRef<Blob[]>([]);
  const sttStreamRef = useRef<MediaStream | null>(null);
  const [sttRecording, setSttRecording] = useState(false);

  const awaitingYesNo = [
    "awaiting_identity_confirm",
    "awaiting_owner_check",
    "awaiting_phone_confirm",
  ].includes(sessionState);
  const needPhone = sessionState === "awaiting_phone_speech";
  const recordDisabled = ["done", "staff_escalation", "idle", "not_recognized"].includes(
    sessionState,
  );

  const speakText = useCallback(
    async (text: string, lang = sessionLang) => {
      if (!text) return;
      setTtsStatus(`Synthesizing (${lang})…`);
      avatarRef.current?.setState("talking");
      try {
        api.setBaseUrl(middlewareUrl);
        const { buffer, contentType } = await api.tts(text, lang);
        const audioEl = audioRef.current;
        if (!audioEl) throw new Error("Audio element missing");
        setTtsStatus(`Audio ${buffer.byteLength} bytes — playing`);
        await avatarRef.current?.playAndLipSync(buffer, audioEl, contentType);
        setTtsStatus("Done");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setTtsStatus(`TTS error: ${msg}`);
        avatarRef.current?.setState("idle");
        throw err;
      }
    },
    [api, middlewareUrl, sessionLang],
  );

  const renderSession = useCallback((data: PublicSession) => {
    setSession(data);
    if (data.ui?.yes_label) setYesLabel(data.ui.yes_label);
    if (data.ui?.no_label) setNoLabel(data.ui.no_label);
    setSessionStatus(
      JSON.stringify(
        {
          state: data.state,
          lang: data.lang,
          gate_id: data.gate_id,
          retries: data.retries,
          gate_open_stub: data.gate_open_stub,
          visit_phone: data.visit_phone,
        },
        null,
        2,
      ),
    );
    if (data.avatar_state) avatarRef.current?.setState(data.avatar_state);
    else if (data.state === "awaiting_phone_speech") avatarRef.current?.setState("listening");
    else if (["done", "staff_escalation", "not_recognized"].includes(data.state)) {
      avatarRef.current?.setState("idle");
    }
  }, []);

  const applyPromptSpeech = useCallback(
    async (data: PublicSession) => {
      if (!data.prompt) return;
      try {
        await speakText(data.speech || data.prompt, data.lang || sessionLang);
      } catch (err) {
        console.warn("Prompt TTS failed", err);
      }
      const listeningStates = [
        "awaiting_language",
        "awaiting_identity_confirm",
        "awaiting_owner_check",
        "awaiting_phone_speech",
        "awaiting_phone_confirm",
      ];
      if (listeningStates.includes(data.state)) {
        avatarRef.current?.setState("listening");
      } else {
        avatarRef.current?.setState(data.avatar_state || "idle");
      }
    },
    [speakText, sessionLang],
  );

  const joinGate = useCallback(() => {
    const g = gateId.trim() || "gate-1";
    api.joinGate(g, (ack) => {
      setSocketStatus(`Socket: joined gate:${g} ${ack?.ok ? "ok" : ""}`);
    });
  }, [api, gateId]);

  useEffect(() => {
    api.setBaseUrl(middlewareUrl);
    api.connectSocket({
      onConnect: () => {
        setSocketStatus(`Socket: connected`);
        joinGate();
      },
      onDisconnect: () => setSocketStatus("Socket: disconnected"),
      onError: (err) => setSocketStatus(`Socket: error ${err.message}`),
      onSessionUpdate: async (data) => {
        renderSession(data);
        await applyPromptSpeech(data);
      },
    });
    return () => api.disconnect();
  }, [api, middlewareUrl, joinGate, renderSession, applyPromptSpeech]);

  useEffect(() => {
    if (api.getSocket()?.connected) joinGate();
  }, [gateId, api, joinGate]);

  const sendInput = useCallback(
    async (payload: SessionInputPayload) => {
      if (!sessionId) return;
      api.setBaseUrl(middlewareUrl);
      const next = await api.emitSessionInput(sessionId, payload);
      renderSession(next);
      await applyPromptSpeech(next);
      return next;
    },
    [api, middlewareUrl, sessionId, renderSession, applyPromptSpeech],
  );

  const startVisit = async () => {
    try {
      api.setBaseUrl(middlewareUrl);
      joinGate();
      const data = await api.sessionStart(gateId.trim() || "gate-1");
      renderSession(data);
      await applyPromptSpeech(data);
    } catch (err) {
      setSessionStatus(String(err));
    }
  };

  const startAnswerRecording = async () => {
    if (answerBusyRef.current || answerRecordingRef.current || recordDisabled) return;
    if (!sessionId) {
      setRecordStatus("Start a visit first.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      answerStreamRef.current = stream;
      answerChunksRef.current = [];
      const mime = pickAudioMime();
      answerRecorderRef.current = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      answerRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size) answerChunksRef.current.push(e.data);
      };
      answerRecorderRef.current.start(250);
      answerRecordingRef.current = true;
      setRecordStatus("Listening — keep holding, then release to send.");
      avatarRef.current?.setState("listening");
    } catch (err) {
      setRecordStatus(
        `Mic blocked: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const stopAnswerRecording = async () => {
    if (!answerRecordingRef.current || !answerRecorderRef.current) return;
    answerRecordingRef.current = false;
    answerBusyRef.current = true;
    setRecordStatus("Stopping… uploading to /stt");
    try {
      await new Promise<void>((resolve) => {
        const rec = answerRecorderRef.current!;
        rec.onstop = () => resolve();
        if (rec.state !== "inactive") rec.stop();
        else resolve();
      });
      answerStreamRef.current?.getTracks().forEach((t) => t.stop());
      answerStreamRef.current = null;

      if (!answerChunksRef.current.length) {
        setRecordStatus("No audio captured — hold longer while speaking.");
        return;
      }

      const type = answerRecorderRef.current.mimeType || "audio/webm";
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
      const blob = new Blob(answerChunksRef.current, { type });
      const form = new FormData();
      form.append("audio", blob, `answer.${ext}`);
      form.append("lang", "en");

      api.setBaseUrl(middlewareUrl);
      const sttData = await api.stt(form);
      setRecordStatus(`Heard: ${JSON.stringify(sttData)}`);
      const payload: SessionInputPayload = { source: "stt", text: sttData.text };
      if (sttData.normalized === "yes" || sttData.normalized === "no") {
        payload.choice = sttData.normalized;
      }
      if (sttData.digits) payload.phone_digits = sttData.digits;
      await sendInput(payload);
    } catch (err) {
      setRecordStatus(`Record/send error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      answerBusyRef.current = false;
      answerRecorderRef.current = null;
      answerChunksRef.current = [];
    }
  };

  const startSttSandbox = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sttStreamRef.current = stream;
      sttChunksRef.current = [];
      const mime = pickAudioMime();
      sttRecorderRef.current = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      sttRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size) sttChunksRef.current.push(e.data);
      };
      sttRecorderRef.current.start(250);
      setSttRecording(true);
      setSttStatus("Recording…");
      avatarRef.current?.setState("listening");
    } catch (err) {
      setSttStatus(`Mic error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const stopSttSandbox = async () => {
    if (!sttRecorderRef.current) return;
    setSttRecording(false);
    try {
      await new Promise<void>((resolve) => {
        const rec = sttRecorderRef.current!;
        rec.onstop = () => resolve();
        rec.stop();
        rec.stream.getTracks().forEach((t) => t.stop());
      });
      const type = sttRecorderRef.current.mimeType || "audio/webm";
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
      const blob = new Blob(sttChunksRef.current, { type });
      const form = new FormData();
      form.append("audio", blob, `clip.${ext}`);
      form.append("lang", "en");
      setSttStatus("Uploading / transcribing…");
      api.setBaseUrl(middlewareUrl);
      const data = await api.stt(form);
      setSttStatus(JSON.stringify(data, null, 2));
    } catch (err) {
      setSttStatus(`STT error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      avatarRef.current?.setState("idle");
      sttRecorderRef.current = null;
    }
  };

  return (
    <main className="mx-auto grid max-w-[960px] gap-5 p-6">
      <header>
        <Logo size={52} />
        <h1 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-3xl font-semibold tracking-tight">
          Toyota Gate Kiosk
        </h1>
        <p className="text-[var(--muted)]">
          Voice (/tts, /stt) on middleware · session flow via Socket.io
        </p>
        <p className="mt-2 text-sm">
          <Link href="/console" className="text-[var(--accent-bright)] hover:underline">
            Demo console
          </Link>
          {" · "}
          <Link href="/logs" className="text-[var(--accent-bright)] hover:underline">
            Integration logs
          </Link>
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-[280px_1fr]">
        <HudPanel title="Avatar">
          <KioskAvatar ref={avatarRef} size={280} onStatusChange={setAvatarStatus} />
          <p className="status-mono mt-3">{avatarStatus}</p>
        </HudPanel>

        <HudPanel title="Session">
          <HudInput
            label="Middleware URL"
            value={middlewareUrl}
            onChange={(e) => setMiddlewareUrl(e.target.value)}
          />
          <HudInput
            label="Gate ID"
            className="mt-3"
            value={gateId}
            onChange={(e) => setGateId(e.target.value)}
          />
          <p className="status-mono mt-2">{socketStatus}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <GlowButton onClick={() => void startVisit()}>Start visit</GlowButton>
            <GlowButton
              variant="ok"
              disabled={!awaitingYesNo}
              onClick={() => void sendInput({ source: "touch", choice: "yes" })}
            >
              {yesLabel}
            </GlowButton>
            <GlowButton
              variant="danger"
              disabled={!awaitingYesNo}
              onClick={() => void sendInput({ source: "touch", choice: "no" })}
            >
              {noLabel}
            </GlowButton>
          </div>

          {session?.profile?.name ? (
            <div className="mt-4 border-l-[3px] border-[var(--accent)] bg-[rgba(0,180,255,0.08)] p-3">
              <div className="font-semibold">{session.profile.name}</div>
              <div>Plate: {session.profile.plate ?? "—"}</div>
              <div>Phone on file: {session.profile.phone ?? "—"}</div>
            </div>
          ) : null}

          <p className="mt-4 text-[var(--muted)]">
            {session?.prompt ?? "Press Start visit to begin."}
          </p>
          {sessionStatus ? <p className="status-mono mt-2">{sessionStatus}</p> : null}

          {needPhone ? (
            <div className="mt-4">
              <h2 className="hud-panel-title">Phone keypad</h2>
              <HudInput
                label="Phone digits"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                inputMode="numeric"
              />
              <Keypad
                value={phoneInput}
                onChange={setPhoneInput}
                onSubmit={() =>
                  void sendInput({ source: "touch", phone_digits: phoneInput })
                }
              />
              <div className="mt-2 flex gap-2">
                <GlowButton
                  variant="ok"
                  onClick={() =>
                    void sendInput({ source: "touch", phone_digits: phoneInput })
                  }
                >
                  Submit number
                </GlowButton>
                <GlowButton variant="secondary" onClick={() => setPhoneInput("")}>
                  Clear
                </GlowButton>
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <GlowButton
              variant="secondary"
              disabled={recordDisabled}
              className={answerRecordingRef.current ? "glow-btn-ok" : ""}
              onPointerDown={(e) => {
                e.preventDefault();
                void startAnswerRecording();
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                void stopAnswerRecording();
              }}
              onPointerLeave={(e) => {
                if (answerRecordingRef.current) void stopAnswerRecording();
                e.preventDefault();
              }}
              onClick={(e) => e.preventDefault()}
            >
              Hold to record answer
            </GlowButton>
            <p className="status-mono mt-2">{recordStatus}</p>
          </div>
        </HudPanel>
      </div>

      <HudPanel title="Stage 1 — TTS sandbox">
        <HudTextarea label="Text to speak" value={ttsText} onChange={(e) => setTtsText(e.target.value)} />
        <div className="mt-3 flex gap-2">
          <GlowButton
            onClick={() =>
              void speakText(ttsText.trim(), "en").then(() => avatarRef.current?.setState("idle"))
            }
          >
            Speak
          </GlowButton>
        </div>
        <audio ref={audioRef} controls className="mt-3 w-full" />
        {ttsStatus ? <p className="status-mono mt-2">{ttsStatus}</p> : null}
      </HudPanel>

      <HudPanel title="Stage 2 — STT sandbox">
        <div className="flex flex-wrap gap-2">
          <GlowButton variant="secondary" disabled={sttRecording} onClick={() => void startSttSandbox()}>
            Record clip
          </GlowButton>
          <GlowButton disabled={!sttRecording} onClick={() => void stopSttSandbox()}>
            Stop &amp; upload
          </GlowButton>
        </div>
        <p className="status-mono mt-2">{sttStatus}</p>
      </HudPanel>
    </main>
  );
}
