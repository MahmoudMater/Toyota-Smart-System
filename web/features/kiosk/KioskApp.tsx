"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Logo } from "@/components/brand/Logo";
import { HudPanel } from "@/components/ui/HudPanel";
import { GlowButton } from "@/components/ui/GlowButton";
import { HudInput } from "@/components/ui/HudInput";
import { createMwApi } from "@/lib/mw-api";
import {
  DEFAULT_MW_URL,
  STORAGE_KEY,
  type CheckinDisplay,
} from "@/lib/types";

export function KioskApp() {
  const api = useMemo(() => createMwApi(), []);
  const [middlewareUrl, setMiddlewareUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MW_URL;
    }
    return DEFAULT_MW_URL;
  });
  const [gateId, setGateId] = useState("gate-1");
  const [socketStatus, setSocketStatus] = useState("Socket: disconnected");
  const [display, setDisplay] = useState<CheckinDisplay | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState("Waiting for vehicles…");

  const applyDisplay = useCallback(async (next: CheckinDisplay) => {
    setDisplay(next);
    if (next.mode === "submitted") {
      setStatusLine(
        next.customerName
          ? `${next.customerName} checked in — barrier opening`
          : "Checked in — barrier opening",
      );
    } else if (next.mode === "sap" && next.customerName) {
      setStatusLine(`Welcome, ${next.customerName}`);
    } else if (next.mode === "lpr") {
      setStatusLine(
        next.plateNumber
          ? `Plate ${next.plateNumber} — scan to finish check-in`
          : "Scan to finish check-in",
      );
    } else {
      setStatusLine("Scan to check in");
    }
    try {
      const url = await QRCode.toDataURL(next.checkinUrl, {
        width: 420,
        margin: 2,
        color: { dark: "#021018", light: "#e8f4ff" },
      });
      setQrDataUrl(url);
    } catch {
      setQrDataUrl(null);
    }
  }, []);

  const connect = useCallback(() => {
    api.setBaseUrl(middlewareUrl.trim());
    setSocketStatus("Connecting…");
    api.connectSocket({
      onConnect: () => {
        setSocketStatus("Socket connected");
        api.joinGate(gateId.trim() || "gate-1", (ack) => {
          setSocketStatus(
            ack?.ok
              ? `Joined gate:${gateId.trim() || "gate-1"}`
              : "Join failed",
          );
        });
        void api
          .checkinDisplay(gateId.trim() || "gate-1")
          .then(applyDisplay)
          .catch(() => {
            /* join ack may already carry display */
          });
      },
      onDisconnect: () => setSocketStatus("Disconnected"),
      onError: (err) => setSocketStatus(`Socket error: ${err.message}`),
      onCheckinDisplay: (data) => {
        void applyDisplay(data);
      },
    });
  }, [api, middlewareUrl, gateId, applyDisplay]);

  useEffect(() => {
    connect();
    return () => api.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- connect once on mount

  const welcome =
    display?.mode === "sap" && display.customerName
      ? `Welcome, ${display.customerName}`
      : display?.mode === "submitted"
        ? "You’re checked in"
        : "Welcome to Al Sayer";

  return (
    <main className="app-shell mx-auto flex min-h-screen max-w-5xl flex-col p-5">
      <div className="watermark-bg" aria-hidden />
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Logo className="h-12 w-auto" />
        <nav className="flex gap-3 text-sm text-[var(--muted)]">
          <Link href="/console" className="hover:text-[var(--accent-bright)]">
            Voice Console
          </Link>
          <Link href="/console/qr" className="hover:text-[var(--accent-bright)]">
            QR Console
          </Link>
          <Link href="/logs" className="hover:text-[var(--accent-bright)]">
            Logs
          </Link>
          <Link href="/checkin" className="hover:text-[var(--accent-bright)]">
            Check-in form
          </Link>
        </nav>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="font-[family-name:var(--font-space-grotesk)] text-3xl font-semibold tracking-tight sm:text-4xl">
            {welcome}
          </p>
          <p className="mt-2 max-w-md text-[var(--muted)]">{statusLine}</p>

          <div className="mt-8 rounded-2xl bg-[#e8f4ff] p-4 shadow-[0_0_40px_rgba(0,180,255,0.15)]">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="Check-in QR code"
                width={420}
                height={420}
                className="h-auto w-[min(70vw,420px)]"
              />
            ) : (
              <div className="flex h-[280px] w-[280px] items-center justify-center text-[var(--bg-deep)]">
                Loading QR…
              </div>
            )}
          </div>

          {display?.plateNumber ? (
            <p className="mt-4 font-[family-name:var(--font-jetbrains-mono)] text-lg tracking-wide">
              {display.plateNumber}
            </p>
          ) : null}

          {display?.expiresAt && display.mode !== "generic" ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Link expires{" "}
              {new Date(display.expiresAt).toLocaleTimeString()}
            </p>
          ) : (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Generic gate QR — always available
            </p>
          )}
        </section>

        <aside className="space-y-4">
          <HudPanel title="Kiosk settings">
            <HudInput
              label="Middleware URL"
              value={middlewareUrl}
              onChange={(e) => setMiddlewareUrl(e.target.value)}
            />
            <div className="mt-3">
              <HudInput
                label="Gate ID"
                value={gateId}
                onChange={(e) => setGateId(e.target.value)}
              />
            </div>
            <div className="mt-3">
              <GlowButton
                onClick={() => {
                  api.disconnect();
                  connect();
                }}
              >
                Reconnect
              </GlowButton>
            </div>
            <p className="status-mono mt-2">{socketStatus}</p>
            {display?.checkinUrl ? (
              <p className="status-mono mt-2 break-all text-[10px]">
                {display.checkinUrl}
              </p>
            ) : null}
          </HudPanel>
        </aside>
      </div>
    </main>
  );
}
