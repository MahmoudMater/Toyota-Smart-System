"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { GlowButton } from "@/components/ui/GlowButton";
import { createMwApi } from "@/lib/mw-api";
import { DEFAULT_MW_URL, STORAGE_KEY } from "@/lib/types";

type FormStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; gateOpened: boolean; plate: string }
  | { kind: "already_queued" }
  | { kind: "error"; message: string };

type Props = {
  gateId: string;
  token?: string;
};

function extractPlateHint(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const root = data as Record<string, unknown>;
  if (typeof root.plateNumber === "string") return root.plateNumber;
  const msg = root.message;
  if (msg && typeof msg === "object") {
    const nested = msg as Record<string, unknown>;
    if (typeof nested.plateNumber === "string") return nested.plateNumber;
  }
  return undefined;
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const root = data as Record<string, unknown>;
  if (typeof root.message === "string") return root.message;
  if (Array.isArray(root.message)) return root.message.join(", ");
  if (root.message && typeof root.message === "object") {
    const nested = root.message as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  return fallback;
}

export function CheckinForm({ gateId, token }: Props) {
  const api = useMemo(() => createMwApi(), []);
  const [plate, setPlate] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plateLocked, setPlateLocked] = useState(false);
  const [activeToken, setActiveToken] = useState<string | undefined>(token);
  const [prefillNote, setPrefillNote] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) api.setBaseUrl(stored);
      else api.setBaseUrl(DEFAULT_MW_URL);
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setPrefillNote("Enter your details to join the queue.");
        return;
      }
      try {
        const ticket = await api.checkinTicket(token, gateId);
        if (cancelled) return;
        setActiveToken(ticket.token);
        setPlate(ticket.plateNumber || "");
        setName(ticket.name || "");
        setPhone(ticket.phone || "");
        setPlateLocked(ticket.plateLocked);
        setPrefillNote(
          ticket.plateLocked
            ? "Plate is locked from the gate camera. You can edit name and phone."
            : "Plate prefilled from the gate camera. Confirm name and phone.",
        );
      } catch (err) {
        if (cancelled) return;
        const e = err as Error & { status?: number; data?: unknown };
        setActiveToken(undefined);
        setPlateLocked(false);
        if (e.status === 410) {
          const hint = extractPlateHint(e.data);
          if (hint) setPlate(hint);
          setPrefillNote(
            "That QR link expired. Continue with the form below.",
          );
        } else {
          setPrefillNote(
            `Could not load ticket: ${e.message}. Use the form below.`,
          );
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [api, gateId, token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: "loading" });
    try {
      const result = await api.checkinSubmit({
        token: activeToken,
        gateId,
        plateNumber: plate.trim(),
        name: name.trim(),
        phone: phone.trim(),
      });
      setStatus({
        kind: "success",
        gateOpened: result.gateOpened,
        plate: result.plateNumber,
      });
    } catch (err) {
      const e = err as Error & { status?: number; data?: unknown };
      if (e.status === 409) {
        setStatus({ kind: "already_queued" });
        return;
      }
      setStatus({
        kind: "error",
        message: extractErrorMessage(e.data, e.message || "Submit failed"),
      });
    }
  }

  if (status.kind === "success") {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <Logo className="mb-8" />
        <div className="rounded-2xl border border-[var(--ok)]/40 bg-[rgba(46,230,166,0.08)] p-6">
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold text-[var(--ok)]">
            You’re in the queue
          </h1>
          <p className="mt-3 text-[var(--foreground)]">
            Plate <strong>{status.plate}</strong> is waiting for a slot.
            {status.gateOpened
              ? " Barrier opening — please drive in."
              : " Barrier may already be open for another car; stay in line."}
          </p>
        </div>
      </div>
    );
  }

  if (status.kind === "already_queued") {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <Logo className="mb-8" />
        <div className="rounded-2xl border border-[var(--warn)]/40 bg-[rgba(255,179,71,0.08)] p-6">
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold text-[var(--warn)]">
            Already in the queue
          </h1>
          <p className="mt-3 text-[var(--muted)]">
            This plate is already waiting. You do not need to submit again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      <Logo className="mb-6" />
      <h1 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold">
        Gate check-in
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">{prefillNote}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">Gate: {gateId}</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="hud-label">Plate number</span>
          <input
            className="hud-input"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            required
            readOnly={plateLocked}
            autoComplete="off"
            inputMode="text"
            placeholder="e.g. TKN 9001"
          />
        </label>
        <label className="block">
          <span className="hud-label">Full name</span>
          <input
            className="hud-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            placeholder="Your name"
          />
        </label>
        <label className="block">
          <span className="hud-label">Mobile phone</span>
          <input
            className="hud-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoComplete="tel"
            inputMode="tel"
            placeholder="05xxxxxxxx"
          />
        </label>

        {status.kind === "error" ? (
          <p className="text-sm text-[var(--danger)]">{status.message}</p>
        ) : null}

        <GlowButton
          type="submit"
          disabled={status.kind === "loading"}
          className="w-full justify-center py-3 text-base"
          variant="ok"
        >
          {status.kind === "loading" ? "Submitting…" : "Join queue"}
        </GlowButton>
      </form>
    </div>
  );
}
