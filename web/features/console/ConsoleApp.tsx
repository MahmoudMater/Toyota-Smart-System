"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HudNav } from "@/components/layout/HudNav";
import { KioskAvatar, type KioskAvatarHandle } from "@/components/avatar/KioskAvatar";
import { HudPanel } from "@/components/ui/HudPanel";
import { GlowButton } from "@/components/ui/GlowButton";
import { HudInput } from "@/components/ui/HudInput";
import { Keypad } from "@/components/ui/Keypad";
import { StatusDot } from "@/components/ui/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { pickAudioMime } from "@/lib/audio";
import { createMwApi } from "@/lib/mw-api";
import {
  DEFAULT_MW_URL,
  STORAGE_KEY,
  type ActiveClaim,
  type AuditEvent,
  type PublicSession,
  type QueueEntry,
  type SessionInputPayload,
} from "@/lib/types";

function cleanSpeechText(raw: string): string {
  return raw
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\.{2,}/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ConsoleApp() {
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
  const [connLabel, setConnLabel] = useState("Disconnected");
  const [connected, setConnected] = useState(false);
  const [configStatus, setConfigStatus] = useState(
    "Not connected. Start middleware on :3000.",
  );

  const [sapName, setSapName] = useState("Mahmoud Mater");
  const [sapPhone, setSapPhone] = useState("0555123456");
  const [sapPlate, setSapPlate] = useState("TKN 9001");
  const [sapStatus, setSapStatus] = useState("Save a profile, then send that plate via LPR.");

  const [lprPlate, setLprPlate] = useState("TKN 9001");
  const [lprStatus, setLprStatus] = useState("Waiting for plate read…");

  const [session, setSession] = useState<PublicSession | null>(null);
  const [sessionStatus, setSessionStatus] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [recordStatus, setRecordStatus] = useState("");
  const [avatarStatus, setAvatarStatus] = useState("idle");

  const [availableSlots, setAvailableSlots] = useState("1");
  const [slotsStatus, setSlotsStatus] = useState(
    "Set how many garage slots are free, then notify that many waiting customers.",
  );
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [queueStatus, setQueueStatus] = useState("");
  const [activeClaims, setActiveClaims] = useState<ActiveClaim[]>([]);
  const [notifyStatus, setNotifyStatus] = useState("No active claims");
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  const [timeline, setTimeline] = useState<AuditEvent[]>([]);

  const claimTimeoutMsRef = useRef(50_000);
  const lastSpokenPromptRef = useRef("");
  const speakingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const answerRecorderRef = useRef<MediaRecorder | null>(null);
  const answerChunksRef = useRef<Blob[]>([]);
  const answerStreamRef = useRef<MediaStream | null>(null);
  const answerRecordingRef = useRef(false);
  const answerBusyRef = useRef(false);

  const sessionId = session?.session_id ?? null;
  const sessionState = session?.state ?? "idle";
  const sessionLang = session?.lang ?? "en";

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
      speakingRef.current = true;
      avatarRef.current?.setState("talking");
      setRecordStatus("Generating speech…");
      try {
        api.setBaseUrl(middlewareUrl);
        const { buffer, contentType } = await api.tts(text, lang);
        
        // If buffer is tiny (<= 100 bytes), it's the silent fallback stub from middleware
        if (buffer.byteLength <= 100) {
          setRecordStatus("Playing voice (browser speech engine)…");
          if (typeof window !== "undefined" && "speechSynthesis" in window) {
            avatarRef.current?.setState("talking");
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(cleanSpeechText(text));
            utterance.lang = lang === "ar" ? "ar-SA" : "en-US";
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            await new Promise<void>((resolve) => {
              utterance.onend = () => {
                avatarRef.current?.setState("idle");
                resolve();
              };
              utterance.onerror = () => {
                avatarRef.current?.setState("idle");
                resolve();
              };
              window.speechSynthesis.speak(utterance);
            });
          }
          setRecordStatus("");
        } else {
          setRecordStatus("Playing voice (ElevenLabs)…");
          const audioEl = audioRef.current;
          if (audioEl) {
            await avatarRef.current?.playAndLipSync(buffer, audioEl, contentType);
          }
          setRecordStatus("");
        }
      } catch (err) {
        setSessionStatus(
          `ElevenLabs TTS unavailable (${err instanceof Error ? err.message : String(err)}). Using browser speech synthesis fallback…`,
        );
        setRecordStatus("Playing voice (browser speech engine)…");
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            avatarRef.current?.setState("talking");
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(cleanSpeechText(text));
            utterance.lang = lang === "ar" ? "ar-SA" : "en-US";
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            await new Promise<void>((resolve) => {
              utterance.onend = () => {
                avatarRef.current?.setState("idle");
                resolve();
              };
              utterance.onerror = () => {
                avatarRef.current?.setState("idle");
                resolve();
              };
              window.speechSynthesis.speak(utterance);
            });
          } catch {
            avatarRef.current?.setState("idle");
          }
        } else {
          avatarRef.current?.setState("idle");
        }
        setRecordStatus("");
      } finally {
        speakingRef.current = false;
      }
    },
    [api, middlewareUrl, sessionLang],
  );

  const renderSession = useCallback((data: PublicSession | null) => {
    if (!data) return;
    setSession(data);
    setSessionStatus(
      JSON.stringify(
        {
          state: data.state,
          gate_id: data.gate_id,
          retries: data.retries,
          gate_open_stub: data.gate_open_stub,
          visit_phone: data.visit_phone,
        },
        null,
        2,
      ),
    );
    if (data.avatar_state && !speakingRef.current) {
      avatarRef.current?.setState(data.avatar_state);
    }
  }, []);

  const applyPromptSpeech = useCallback(
    async (data: PublicSession) => {
      if (!data.prompt || data.prompt === lastSpokenPromptRef.current) return;
      lastSpokenPromptRef.current = data.prompt;
      await speakText(data.speech || data.prompt, data.lang || "en");
      const listening = [
        "awaiting_identity_confirm",
        "awaiting_owner_check",
        "awaiting_phone_speech",
        "awaiting_phone_confirm",
      ];
      if (listening.includes(data.state)) avatarRef.current?.setState("listening");
      else avatarRef.current?.setState(data.avatar_state || "idle");
    },
    [speakText],
  );

  const renderQueue = useCallback((entries: QueueEntry[]) => {
    setQueueEntries(entries);
    const claims = entries
      .filter((e) => e.status === "notified")
      .map((e) => ({
        entryId: e.id,
        slotId: e.slotId || "",
        plateNumber: e.plateNumber || "",
        notifiedAt: e.notifiedAt || new Date().toISOString(),
      }));
    setActiveClaims(claims);
    if (!claims.length) {
      setNotifyStatus(
        "No active claims — set available slots, then Free slots & notify.",
      );
    } else {
      setNotifyStatus(
        `${claims.length} customer(s) notified on WhatsApp + SMS + App (dummy). Confirm each via WhatsApp or wait for timeout.`,
      );
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      api.setBaseUrl(middlewareUrl);
      const [q, audit, slots] = await Promise.all([
        api.queue(),
        api.auditEvents(40),
        api.getAvailableSlots().catch(() => null),
      ]);
      renderQueue(Array.isArray(q) ? q : []);
      setTimeline(Array.isArray(audit) ? audit : []);
      if (slots && typeof slots.available === "number") {
        setAvailableSlots(String(slots.available));
        setSlotsStatus(
          `Available free slots: ${slots.available} · active claims: ${(slots.activeClaims || []).length}`,
        );
      }
      setQueueStatus(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      setQueueStatus(`Refresh error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [api, middlewareUrl, renderQueue]);

  const connect = useCallback(async () => {
    api.setBaseUrl(middlewareUrl.trim());
    setConfigStatus("Connecting…");
    setConnected(false);
    setConnLabel("Connecting…");
    try {
      const [health, cfg] = await Promise.all([api.health(), api.demoConfig()]);
      claimTimeoutMsRef.current = cfg.claimTimeoutMs || 50_000;
      setConfigStatus(
        `OK · middleware ${health.service || "up"} · TTS=${health.tts_voices || "?"} · STT=${health.stt_model || "?"} · claim ${claimTimeoutMsRef.current / 1000}s`,
      );

      api.connectSocket({
        onConnect: () => {
          setConnected(true);
          setConnLabel("Socket connected");
          api.joinGate(gateId.trim() || "gate-1", (ack) => {
            setConnLabel(
              ack?.ok ? `Joined gate:${gateId.trim() || "gate-1"}` : "Join failed",
            );
          });
        },
        onDisconnect: () => {
          setConnected(false);
          setConnLabel("Disconnected");
        },
        onError: (err) => {
          setConnected(false);
          setConnLabel(`Socket error: ${err.message}`);
        },
        onSessionUpdate: async (data) => {
          renderSession(data);
          await applyPromptSpeech(data);
          void refreshAll();
        },
      });

      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => void refreshAll(), 2000);
      await refreshAll();
    } catch (err) {
      setConfigStatus(
        `Connect failed: ${err instanceof Error ? err.message : String(err)}. Middleware ${api.getBaseUrl()}`,
      );
      setConnLabel("Failed");
    }
  }, [
    api,
    middlewareUrl,
    gateId,
    renderSession,
    applyPromptSpeech,
    refreshAll,
  ]);

  useEffect(() => {
    void connect();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      api.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- connect once on mount

  useEffect(() => {
    if (!activeClaims.length) {
      setCountdowns({});
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      return;
    }
    const tick = () => {
      const next: Record<string, number> = {};
      let expired = false;
      for (const c of activeClaims) {
        const end = new Date(c.notifiedAt).getTime() + claimTimeoutMsRef.current;
        const left = Math.max(0, end - Date.now());
        next[c.entryId] = Math.ceil(left / 1000);
        if (left <= 0) expired = true;
      }
      setCountdowns(next);
      if (expired) setTimeout(() => void refreshAll(), 600);
    };
    tick();
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(tick, 250);
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [activeClaims, refreshAll]);

  const sendInput = async (payload: SessionInputPayload) => {
    if (!sessionId) return;
    try {
      api.setBaseUrl(middlewareUrl);
      const next = await api.emitSessionInput(sessionId, payload);
      renderSession(next);
      await applyPromptSpeech(next);
      void refreshAll();
    } catch (err) {
      setSessionStatus(String(err instanceof Error ? err.message : err));
    }
  };

  const startAnswerRecording = async () => {
    if (answerBusyRef.current || answerRecordingRef.current || recordDisabled) return;
    if (!sessionId) {
      setRecordStatus("No active session yet.");
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
      setRecordStatus("Listening…");
      avatarRef.current?.setState("listening");
    } catch (err) {
      setRecordStatus(`Mic error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const stopAnswerRecording = async () => {
    if (!answerRecordingRef.current || !answerRecorderRef.current) return;
    answerRecordingRef.current = false;
    answerBusyRef.current = true;
    setRecordStatus("Uploading to /stt…");
    try {
      await new Promise<void>((resolve) => {
        const rec = answerRecorderRef.current!;
        rec.onstop = () => resolve();
        if (rec.state !== "inactive") rec.stop();
        else resolve();
      });
      answerStreamRef.current?.getTracks().forEach((t) => t.stop());
      const type = answerRecorderRef.current.mimeType || "audio/webm";
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
      const blob = new Blob(answerChunksRef.current, { type });
      const form = new FormData();
      form.append("audio", blob, `answer.${ext}`);
      form.append("lang", "en");
      api.setBaseUrl(middlewareUrl);
      const sttData = await api.stt(form);
      setRecordStatus(`Heard: ${sttData.text || "(empty)"}`);
      const payload: SessionInputPayload = { source: "stt", text: sttData.text };
      if (sttData.normalized === "yes" || sttData.normalized === "no") {
        payload.choice = sttData.normalized;
      }
      if (sttData.digits) payload.phone_digits = sttData.digits;
      await sendInput(payload);
    } catch (err) {
      setRecordStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      answerBusyRef.current = false;
      answerRecorderRef.current = null;
      answerChunksRef.current = [];
    }
  };

  return (
    <main className="app-shell mx-auto max-w-[1280px] p-5">
      <div className="watermark-bg" aria-hidden />
      <HudNav />
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-semibold">
            Smart Gate — Voice Console
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Approach A: LPR + SAP → avatar TTS/STT → queue notify → WhatsApp
            confirm
          </p>
        </div>
        <StatusDot connected={connected} label={connLabel} />
      </header>

      <HudPanel title="1 · Connection" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <HudInput
            label="Middleware URL (NestJS)"
            value={middlewareUrl}
            onChange={(e) => setMiddlewareUrl(e.target.value)}
          />
          <HudInput
            label="Gate ID"
            value={gateId}
            onChange={(e) => setGateId(e.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <GlowButton onClick={() => void connect()}>Connect</GlowButton>
          <GlowButton
            variant="danger"
            onClick={async () => {
              api.setBaseUrl(middlewareUrl.trim());
              const r = await api.resetDemo();
              setSession(null);
              lastSpokenPromptRef.current = "";
              setActiveClaims([]);
              setConfigStatus(`Reset OK — deleted ${r.deleted} keys`);
              await refreshAll();
            }}
          >
            Reset demo run
          </GlowButton>
          <GlowButton variant="secondary" onClick={() => void refreshAll()}>
            Refresh queue + audit
          </GlowButton>
        </div>
        <p className="status-mono mt-2">{configStatus}</p>
      </HudPanel>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <HudPanel title="2 · SAP profile (register before LPR)">
          <HudInput label="Client name" value={sapName} onChange={(e) => setSapName(e.target.value)} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <HudInput label="Phone" value={sapPhone} onChange={(e) => setSapPhone(e.target.value)} />
            <HudInput label="Plate" value={sapPlate} onChange={(e) => setSapPlate(e.target.value)} />
          </div>
          <div className="mt-3">
            <GlowButton
              variant="ok"
              onClick={async () => {
                api.setBaseUrl(middlewareUrl.trim());
                const profile = await api.saveSapProfile({
                  plateNumber: sapPlate.trim(),
                  name: sapName.trim(),
                  phone: sapPhone.trim(),
                });
                setSapStatus(`Saved: ${profile.name} / ${profile.plate} / ${profile.phone}`);
                setLprPlate(profile.plate);
              }}
            >
              Save SAP profile
            </GlowButton>
          </div>
          <p className="status-mono mt-2">{sapStatus}</p>
        </HudPanel>

        <HudPanel title="3 · LPR camera (simulate plate read)">
          <HudInput label="Plate number" value={lprPlate} onChange={(e) => setLprPlate(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <GlowButton
              onClick={async () => {
                lastSpokenPromptRef.current = "";
                api.setBaseUrl(middlewareUrl.trim());
                if (!api.getSocket()?.connected) await connect();
                else api.joinGate(gateId.trim() || "gate-1");
                const result = await api.plateRead({
                  gateId: gateId.trim() || "gate-1",
                  plateNumber: lprPlate.trim(),
                });
                if (!result.accepted && result.reason === "already_queued_or_active") {
                  setLprStatus("Plate was active from previous run — resetting plate lock & re-sending…");
                  await api.saveSapProfile({
                    plateNumber: sapPlate.trim(),
                    name: sapName.trim(),
                    phone: sapPhone.trim(),
                  });
                  const retry = await api.plateRead({
                    gateId: gateId.trim() || "gate-1",
                    plateNumber: lprPlate.trim(),
                  });
                  setLprStatus(
                    retry.accepted
                      ? `Accepted plate ${retry.plateNumber} — waiting for SAP → session push…`
                      : `Rejected: ${retry.reason || "deduped"}`,
                  );
                } else {
                  setLprStatus(
                    result.accepted
                      ? `Accepted plate ${result.plateNumber} — waiting for SAP → session push…`
                      : `Rejected: ${result.reason || "deduped"} (click Reset demo run if stuck)`,
                  );
                }
                setTimeout(() => void refreshAll(), 400);
              }}
            >
              Send plate read
            </GlowButton>
            <GlowButton variant="secondary" onClick={() => setLprPlate(sapPlate.trim())}>
              Copy from SAP plate
            </GlowButton>
          </div>
          <p className="status-mono mt-2">{lprStatus}</p>
        </HudPanel>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[280px_1fr_1fr]">
        <HudPanel title="4 · Avatar">
          <KioskAvatar ref={avatarRef} size={260} onStatusChange={setAvatarStatus} />
          <p className="status-mono mt-2">{avatarStatus}</p>
          <audio ref={audioRef} className="hidden" />
        </HudPanel>

        <HudPanel title="5 · Visit session">
          {session?.profile?.name ? (
            <div className="mb-3 border-l-[3px] border-[var(--accent)] bg-[rgba(0,180,255,0.08)] p-3">
              <div className="font-semibold">{session.profile.name}</div>
              <div>Plate: {session.profile.plate ?? "—"}</div>
              <div>Phone: {session.profile.phone ?? "—"}</div>
            </div>
          ) : null}
          <p className="min-h-12 text-[var(--foreground)]">
            {session?.prompt ?? "Save SAP profile → send LPR plate → avatar greets."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <GlowButton
              variant="ok"
              disabled={!awaitingYesNo}
              onClick={() => void sendInput({ source: "touch", choice: "yes" })}
            >
              Yes
            </GlowButton>
            <GlowButton
              variant="danger"
              disabled={!awaitingYesNo}
              onClick={() => void sendInput({ source: "touch", choice: "no" })}
            >
              No
            </GlowButton>
            <GlowButton
              variant="secondary"
              disabled={recordDisabled}
              onPointerDown={(e) => {
                e.preventDefault();
                void startAnswerRecording();
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                void stopAnswerRecording();
              }}
              onPointerLeave={() => {
                if (answerRecordingRef.current) void stopAnswerRecording();
              }}
              onClick={(e) => e.preventDefault()}
            >
              Hold to speak
            </GlowButton>
          </div>
          {needPhone ? (
            <div className="mt-3">
              <HudInput
                label="Visit phone"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                inputMode="numeric"
              />
              <Keypad
                value={phoneInput}
                onChange={setPhoneInput}
                onSubmit={() => void sendInput({ source: "touch", phone_digits: phoneInput })}
              />
              <div className="mt-2 flex gap-2">
                <GlowButton
                  variant="ok"
                  onClick={() => void sendInput({ source: "touch", phone_digits: phoneInput })}
                >
                  Submit number
                </GlowButton>
                <GlowButton variant="secondary" onClick={() => setPhoneInput("")}>
                  Clear
                </GlowButton>
              </div>
            </div>
          ) : null}
          {sessionStatus ? <p className="status-mono mt-2">{sessionStatus}</p> : null}
          {recordStatus ? <p className="status-mono mt-1">{recordStatus}</p> : null}
        </HudPanel>

        <HudPanel title="6 · Queue & notify">
          <HudInput
            label="Available free slots"
            type="number"
            min={0}
            max={50}
            value={availableSlots}
            onChange={(e) => setAvailableSlots(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <GlowButton
              variant="secondary"
              onClick={async () => {
                const r = await api.setAvailableSlots(Number(availableSlots));
                setSlotsStatus(`Saved available free slots: ${r.available}`);
              }}
            >
              Save available
            </GlowButton>
            <GlowButton
              onClick={async () => {
                const n = Number(availableSlots);
                if (n > 0) await api.setAvailableSlots(n);
                const result = await api.freedBatch(n > 0 ? n : undefined);
                setQueueStatus(
                  `Freed ${result.requested} slot(s) → notified ${result.notified}. Remaining available: ${result.available}`,
                );
                setAvailableSlots(String(result.available));
                setTimeout(() => void refreshAll(), 400);
              }}
            >
              Free slots &amp; notify queue
            </GlowButton>
          </div>
          <p className="status-mono mt-2">{slotsStatus}</p>

          {activeClaims.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-md border border-[var(--accent)] px-2 py-1 text-[var(--accent)]">
                  WhatsApp
                </span>
                <span className="rounded-md border border-[var(--border)] px-2 py-1">SMS</span>
                <span className="rounded-md border border-[var(--border)] px-2 py-1">Toyota App</span>
              </div>
              {activeClaims.map((c) => (
                <div
                  key={c.entryId}
                  className="mb-2 rounded-lg border border-[var(--border)] p-3"
                >
                  <div>
                    <strong>{c.plateNumber}</strong> · slot{" "}
                    <code className="text-[var(--accent-bright)]">{c.slotId}</code>
                  </div>
                  <div className="font-[family-name:var(--font-jetbrains-mono)] text-2xl font-bold text-[var(--accent)]">
                    {countdowns[c.entryId] ?? "—"}s
                  </div>
                  <GlowButton
                    variant="ok"
                    className="mt-2"
                    onClick={async () => {
                      await api.whatsappConfirm({
                        entryId: c.entryId,
                        slotId: c.slotId,
                        plateNumber: c.plateNumber,
                      });
                      setNotifyStatus(`Confirmed ${c.plateNumber} — assigning slot…`);
                      setTimeout(() => void refreshAll(), 400);
                    }}
                  >
                    WhatsApp confirm
                  </GlowButton>
                </div>
              ))}
              <p className="status-mono mt-2">{notifyStatus}</p>
            </div>
          ) : null}

          <div className="mt-4 overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[var(--muted)]">
                  <th className="p-2">#</th>
                  <th className="p-2">Plate</th>
                  <th className="p-2">Phone</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Slot</th>
                </tr>
              </thead>
              <tbody>
                {queueEntries.length ? (
                  queueEntries.map((e, i) => (
                    <tr key={e.id} className="border-t border-[var(--border)]">
                      <td className="p-2">{i + 1}</td>
                      <td className="p-2">{e.plateNumber}</td>
                      <td className="p-2">{e.phone}</td>
                      <td className="p-2">
                        <Badge status={e.status || "waiting"} />
                      </td>
                      <td className="p-2">{e.slotId || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="status-mono p-2">
                      Queue empty
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {queueStatus ? <p className="status-mono mt-2">{queueStatus}</p> : null}
        </HudPanel>
      </div>

      <HudPanel title="7 · Event timeline (the talking)">
        <div className="flex max-h-[360px] flex-col gap-2 overflow-auto">
          {timeline.length ? (
            timeline.map((e) => {
              const payload =
                typeof e.payload === "string"
                  ? e.payload
                  : JSON.stringify(e.payload ?? {});
              const short = payload.length > 160 ? payload.slice(0, 160) + "…" : payload;
              return (
                <div
                  key={e.id ?? `${e.event}-${e.at}`}
                  className="rounded-lg border-l-[3px] border-[var(--border)] bg-black/20 p-2 text-sm"
                >
                  <div className="font-semibold text-[var(--accent)]">{e.event}</div>
                  <div className="status-mono text-xs">
                    {e.at} · {e.id}
                  </div>
                  <div className="status-mono text-xs">{short}</div>
                </div>
              );
            })
          ) : (
            <div className="status-mono">Events appear here as the flow runs…</div>
          )}
        </div>
      </HudPanel>
    </main>
  );
}
