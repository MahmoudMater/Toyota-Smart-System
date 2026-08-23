"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Socket } from "socket.io-client";
import { GlowButton } from "@/components/ui/GlowButton";
import { StatusDot } from "@/components/ui/StatusDot";
import { HudInput } from "@/components/ui/HudInput";
import { createMwApi } from "@/lib/mw-api";
import { DEFAULT_MW_URL, STORAGE_KEY, type LogLine } from "@/lib/types";
import { cn } from "@/lib/cn";

const DEFAULT_TABS = [
  "all",
  "elevenlabs",
  "tts",
  "stt",
  "lpr",
  "nlu",
  "sap",
  "gate",
  "notifications",
];

export function LogsApp() {
  const api = useMemo(() => createMwApi(), []);
  const logViewRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const integrationRef = useRef("all");

  const [middlewareUrl, setMiddlewareUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MW_URL;
    }
    return DEFAULT_MW_URL;
  });
  const [integration, setIntegration] = useState("all");
  const [tabs, setTabs] = useState<string[]>(DEFAULT_TABS);
  const [filter, setFilter] = useState("");
  const [paused, setPaused] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    integrationRef.current = integration;
  }, [integration]);

  const matchesFilter = useCallback(
    (line: LogLine) => {
      if (!filter) return true;
      return (line.pretty || "").toLowerCase().includes(filter.toLowerCase());
    },
    [filter],
  );

  const scrollToBottom = useCallback(() => {
    if (autoscroll && logViewRef.current) {
      logViewRef.current.scrollTop = logViewRef.current.scrollHeight;
    }
  }, [autoscroll]);

  const subscribe = useCallback((name: string) => {
    setIntegration(name);
    setLines([]);
    if (logViewRef.current) {
      logViewRef.current.innerHTML = "";
    }
    socketRef.current?.emit("logs.subscribe", { integration: name });
  }, []);

  useEffect(() => {
    api.setBaseUrl(middlewareUrl);
    const socket = api.connectLogsSocket(middlewareUrl);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("logs.subscribe", { integration: integrationRef.current });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on(
      "logs.backlog",
      (payload: { integrations?: string[]; lines?: LogLine[] }) => {
        if (payload?.integrations) {
          setTabs(["all", ...payload.integrations]);
        }
        setLines(Array.isArray(payload?.lines) ? payload.lines : []);
      },
    );
    socket.on("logs.line", (line: LogLine) => {
      if (paused) return;
      setLines((prev) => {
        const next = [...prev, line];
        if (next.length > 2000) next.splice(0, next.length - 2000);
        return next;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [api, middlewareUrl, paused]);

  useEffect(() => {
    scrollToBottom();
  }, [lines, filter, scrollToBottom]);

  const visible = lines.filter(matchesFilter);

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <div className="watermark-bg" aria-hidden />
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[rgba(2,6,13,0.92)] px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold">
              Integration Logs
            </h1>
            <p className="text-xs text-[var(--muted)]">
              Live stream from Nest ·{" "}
              <Link href="/" className="text-[var(--accent-bright)] hover:underline">
                Kiosk
              </Link>
              {" · "}
              <Link href="/console" className="text-[var(--accent-bright)] hover:underline">
                Demo console
              </Link>{" "}
              · files under <code>middleware/logs/</code>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusDot connected={connected} label={connected ? "Connected" : "Disconnected"} />
            <HudInput
              className="min-w-[180px]"
              placeholder="Middleware URL"
              value={middlewareUrl}
              onChange={(e) => setMiddlewareUrl(e.target.value)}
            />
            <HudInput
              className="min-w-[160px]"
              placeholder="Filter text…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <GlowButton
              variant={paused ? "primary" : "secondary"}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? "Resume" : "Pause"}
            </GlowButton>
            <GlowButton
              variant={autoscroll ? "primary" : "secondary"}
              onClick={() => setAutoscroll((a) => !a)}
            >
              Auto-scroll
            </GlowButton>
            <GlowButton variant="secondary" onClick={() => setLines([])}>
              Clear
            </GlowButton>
          </div>
        </div>
        <div className="mx-auto mt-3 flex max-w-[1400px] flex-wrap gap-2 px-0">
          {tabs.map((name) => (
            <button
              key={name}
              type="button"
              className={cn(
                "glow-btn glow-btn-secondary px-3 py-1.5 text-sm",
                integration === name && "border-[var(--accent)] text-[var(--accent-bright)]",
              )}
              onClick={() => subscribe(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 p-4">
        <div
          ref={logViewRef}
          className="min-h-[70vh] max-h-[calc(100vh-160px)] overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-[#070b0b] p-3 font-[family-name:var(--font-jetbrains-mono)] text-[0.78rem] leading-relaxed"
        >
          {!visible.length ? (
            <div className="py-8 text-center text-[var(--muted)]">
              {connected
                ? "No log lines yet for this filter / integration."
                : "Connecting to /logs…"}
            </div>
          ) : (
            visible.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "mb-3 border-b border-dashed border-[rgba(232,244,255,0.08)] pb-2",
                  line.kind === "request" && "log-entry-request",
                  line.kind === "response" && "log-entry-response",
                  line.kind === "error" && "log-entry-error",
                  line.kind === "retry" && "log-entry-retry",
                  line.kind === "event" && "log-entry-event",
                )}
              >
                {line.pretty}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
