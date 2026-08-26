"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { HudNav } from "@/components/layout/HudNav";
import { HudPanel } from "@/components/ui/HudPanel";
import { GlowButton } from "@/components/ui/GlowButton";
import { HudInput } from "@/components/ui/HudInput";
import { StatusDot } from "@/components/ui/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { createMwApi } from "@/lib/mw-api";
import {
  DEFAULT_MW_URL,
  STORAGE_KEY,
  type ActiveClaim,
  type AuditEvent,
  type CheckinDisplay,
  type QueueEntry,
} from "@/lib/types";

export function QrConsoleApp() {
  const api = useMemo(() => createMwApi(), []);

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
  const [sapStatus, setSapStatus] = useState(
    "Save a profile, then send that plate via LPR.",
  );

  const [lprPlate, setLprPlate] = useState("TKN 9001");
  const [lprStatus, setLprStatus] = useState("Waiting for plate read…");

  const [display, setDisplay] = useState<CheckinDisplay | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

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
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyDisplay = useCallback(async (next: CheckinDisplay) => {
    setDisplay(next);
    try {
      const url = await QRCode.toDataURL(next.checkinUrl, {
        width: 280,
        margin: 1,
        color: { dark: "#021018", light: "#e8f4ff" },
      });
      setQrDataUrl(url);
    } catch {
      setQrDataUrl(null);
    }
  }, []);

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
      setQueueStatus(
        `Refresh error: ${err instanceof Error ? err.message : String(err)}`,
      );
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
        `OK · middleware ${health.service || "up"} · claim ${claimTimeoutMsRef.current / 1000}s`,
      );

      api.connectSocket({
        onConnect: () => {
          setConnected(true);
          setConnLabel("Socket connected");
          api.joinGate(gateId.trim() || "gate-1", (ack) => {
            setConnLabel(
              ack?.ok
                ? `Joined gate:${gateId.trim() || "gate-1"}`
                : "Join failed",
            );
          });
          void api
            .checkinDisplay(gateId.trim() || "gate-1")
            .then(applyDisplay)
            .catch(() => undefined);
        },
        onDisconnect: () => {
          setConnected(false);
          setConnLabel("Disconnected");
        },
        onError: (err) => {
          setConnected(false);
          setConnLabel(`Socket error: ${err.message}`);
        },
        onCheckinDisplay: (data) => {
          void applyDisplay(data);
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
  }, [api, middlewareUrl, gateId, applyDisplay, refreshAll]);

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
        const end =
          new Date(c.notifiedAt).getTime() + claimTimeoutMsRef.current;
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

  const formHref = display?.checkinUrl
    ? display.checkinUrl.replace(/^https?:\/\/[^/]+/, "")
    : `/checkin?gate=${encodeURIComponent(gateId.trim() || "gate-1")}`;

  return (
    <main className="app-shell mx-auto max-w-[1280px] p-5">
      <div className="watermark-bg" aria-hidden />
      <HudNav />
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-semibold">
            Smart Gate — QR Check-in Console
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Approach B: LPR + SAP → QR form → queue notify → WhatsApp confirm
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
              setDisplay(null);
              setQrDataUrl(null);
              setActiveClaims([]);
              setConfigStatus(`Reset OK — deleted ${r.deleted} keys`);
              await refreshAll();
              const d = await api.checkinDisplay(gateId.trim() || "gate-1");
              await applyDisplay(d);
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
          <HudInput
            label="Client name"
            value={sapName}
            onChange={(e) => setSapName(e.target.value)}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <HudInput
              label="Phone"
              value={sapPhone}
              onChange={(e) => setSapPhone(e.target.value)}
            />
            <HudInput
              label="Plate"
              value={sapPlate}
              onChange={(e) => setSapPlate(e.target.value)}
            />
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
                setSapStatus(
                  `Saved: ${profile.name} / ${profile.plate} / ${profile.phone}`,
                );
                setLprPlate(profile.plate);
              }}
            >
              Save SAP profile
            </GlowButton>
          </div>
          <p className="status-mono mt-2">{sapStatus}</p>
        </HudPanel>

        <HudPanel title="3 · LPR camera (simulate plate read)">
          <HudInput
            label="Plate number"
            value={lprPlate}
            onChange={(e) => setLprPlate(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <GlowButton
              onClick={async () => {
                api.setBaseUrl(middlewareUrl.trim());
                if (!api.getSocket()?.connected) await connect();
                else api.joinGate(gateId.trim() || "gate-1");
                const result = await api.plateRead({
                  gateId: gateId.trim() || "gate-1",
                  plateNumber: lprPlate.trim(),
                });
                setLprStatus(
                  result.accepted
                    ? `Accepted plate ${result.plateNumber} — waiting for SAP → check-in QR…`
                    : `Rejected: ${result.reason || "deduped"} (reset demo if plate still active)`,
                );
                setTimeout(() => void refreshAll(), 400);
              }}
            >
              Send plate read
            </GlowButton>
            <GlowButton
              variant="secondary"
              onClick={() => setLprPlate(sapPlate.trim())}
            >
              Copy from SAP plate
            </GlowButton>
          </div>
          <p className="status-mono mt-2">{lprStatus}</p>
        </HudPanel>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <HudPanel title="4 · Check-in QR (kiosk preview)">
          {display?.mode === "sap" && display.customerName ? (
            <p className="mb-3 text-xl font-semibold">
              Welcome, {display.customerName}
            </p>
          ) : null}
          <div className="flex flex-wrap items-start gap-4">
            <div className="rounded-xl bg-[#e8f4ff] p-3">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="Check-in QR" width={200} height={200} />
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center text-sm text-[var(--bg-deep)]">
                  No QR yet
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm text-[var(--muted)]">
                Mode: <strong>{display?.mode ?? "—"}</strong>
                {display?.plateNumber ? ` · ${display.plateNumber}` : ""}
              </p>
              <p className="status-mono break-all text-[10px]">
                {display?.checkinUrl ?? "Send an LPR plate or wait for generic QR."}
              </p>
              <div className="flex flex-wrap gap-2">
                <GlowButton
                  variant="ok"
                  onClick={() => {
                    window.open(formHref, "_blank", "noopener,noreferrer");
                  }}
                >
                  Open check-in form
                </GlowButton>
                <GlowButton
                  variant="secondary"
                  onClick={async () => {
                    const d = await api.checkinDisplay(gateId.trim() || "gate-1");
                    await applyDisplay(d);
                  }}
                >
                  Refresh display
                </GlowButton>
              </div>
            </div>
          </div>
        </HudPanel>

        <HudPanel title="5 · Queue & notify">
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
                <span className="rounded-md border border-[var(--border)] px-2 py-1">
                  SMS
                </span>
                <span className="rounded-md border border-[var(--border)] px-2 py-1">
                  Toyota App
                </span>
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
                      setNotifyStatus(
                        `Confirmed ${c.plateNumber} — assigning slot…`,
                      );
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

      <HudPanel title="6 · Event timeline">
        <div className="flex max-h-[360px] flex-col gap-2 overflow-auto">
          {timeline.length ? (
            timeline.map((e) => {
              const payload =
                typeof e.payload === "string"
                  ? e.payload
                  : JSON.stringify(e.payload ?? {});
              const short =
                payload.length > 160 ? payload.slice(0, 160) + "…" : payload;
              return (
                <div
                  key={e.id ?? `${e.event}-${e.at}`}
                  className="rounded-lg border-l-[3px] border-[var(--border)] bg-black/20 p-2 text-sm"
                >
                  <div className="font-semibold text-[var(--accent)]">
                    {e.event}
                  </div>
                  <div className="status-mono text-xs">
                    {e.at} · {e.id}
                  </div>
                  <div className="status-mono text-xs">{short}</div>
                </div>
              );
            })
          ) : (
            <div className="status-mono">
              Events appear here as the flow runs…
            </div>
          )}
        </div>
      </HudPanel>
    </main>
  );
}
