"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckinForm } from "@/features/checkin/CheckinForm";

function CheckinPageInner() {
  const params = useSearchParams();
  const gateId = (params.get("gate") || "gate-1").trim() || "gate-1";
  const token = params.get("t")?.trim() || undefined;
  return <CheckinForm gateId={gateId} token={token} />;
}

export default function CheckinPage() {
  return (
    <main className="min-h-screen">
      <div className="watermark-bg" aria-hidden />
      <Suspense
        fallback={
          <p className="p-8 text-sm text-[var(--muted)]">Loading check-in…</p>
        }
      >
        <CheckinPageInner />
      </Suspense>
    </main>
  );
}
