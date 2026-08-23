---
name: puppeteer-pdf-generation
description: >
  Use this skill whenever the task involves generating a downloadable PDF from
  HTML/CSS in a Next.js (App Router) project — booking confirmations, invoices,
  appointment slips, certificates, reports, or any "download as PDF" feature.
  Trigger on mentions of "PDF", "download PDF", "print to PDF", "puppeteer",
  "appointment/booking PDF", or "generate document". Do NOT use for editing
  existing PDF files (form filling, merging, watermarking) — that's a different
  concern (use pdf-lib or a dedicated PDF-editing tool for that).
---

# PDF Generation via Puppeteer (Next.js, containerized deployment)

## When to reach for this vs alternatives

- Use **Puppeteer** (this skill) when: the output needs full CSS (custom fonts,
  RTL/Arabic text, gradients, background images, tenant branding, complex
  multi-column layouts) and the project runs on a persistent Node
  server/container (Kubernetes, Docker, VM) — NOT on Vercel serverless/edge
  functions where cold-start size limits make headless Chromium painful.
- Do **not** use this skill if: the target is Vercel serverless/edge, or the
  PDF is a trivial text+table document with no branding needs — in that case
  prefer `@react-pdf/renderer` instead and stop here.
- Do **not** use this skill for filling/editing an existing PDF template — use
  `pdf-lib` for that instead.

If unsure which applies, ask the user how/where the app is deployed before
scaffolding anything.

---

## 1. Install

```bash
npm install puppeteer
```

Use the full `puppeteer` package (bundles a matching Chromium build), not
`puppeteer-core`, unless the user's Dockerfile already manages its own
Chromium binary and passes `executablePath` explicitly.

---

## 2. Browser lifecycle — reuse a singleton, never launch-per-request

Launching headless Chromium is expensive (~1-2s cold, ~150-300MB RAM per
instance). Never call `puppeteer.launch()` inside a request handler in a loop
or under load. Instead, keep one shared browser instance per server process
and open/close a `page` per request.

```ts
// lib/pdf/browser.ts
import puppeteer, { Browser } from 'puppeteer';

let browserPromise: Promise<Browser> | null = null;

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // avoids /dev/shm OOM crashes in containers
      ],
    });

    // If Chromium crashes, drop the cached promise so the next call relaunches
    browserPromise.then((b) =>
      b.on('disconnected', () => {
        browserPromise = null;
      })
    );
  }
  return browserPromise;
}
```

Rules for the agent to follow:
- `--disable-dev-shm-usage` is mandatory in containers — Docker's default
  `/dev/shm` size (64MB) is too small for Chromium and causes silent crashes
  under load. Either set this flag or mount a bigger `/dev/shm`.
- Always wrap page-level work in `try { ... } finally { await page.close(); }`.
  Never close the shared `browser`, only the `page`.
- If concurrent PDF requests are expected across many tenants, consider a
  small page pool or a queue (BullMQ, since this project already uses it) so
  memory doesn't spike from unbounded concurrent `page.pdf()` calls.

---

## 3. HTML template pattern

Keep the HTML template as a pure function that takes structured data and
returns a string. Do not fetch data inside the template — pass it in
pre-fetched so the template stays testable and reusable (e.g. also usable for
an email preview).

```ts
// lib/pdf/templates/appointment.ts
export interface AppointmentPdfData {
  tenantName: string;
  tenantLogoUrl?: string;
  customerName: string;
  serviceName: string;
  appointmentDate: string; // pre-formatted, don't format in the template
  appointmentTime: string;
  location?: string;
  bookingRef: string;
  locale?: 'en' | 'ar';
}

export function renderAppointmentHtml(data: AppointmentPdfData): string {
  const isRtl = data.locale === 'ar';

  return `
<!DOCTYPE html>
<html lang="${data.locale ?? 'en'}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: ${isRtl ? "'Cairo', 'Tajawal', sans-serif" : "'Inter', sans-serif"};
    margin: 0;
    padding: 24mm 15mm;
    color: #1a1a1a;
  }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 24px; }
  .logo { height: 40px; }
  .title { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
  .ref { color: #64748b; font-size: 12px; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
  .label { color: #64748b; font-size: 13px; }
  .value { font-weight: 600; font-size: 14px; }
</style>
</head>
<body>
  <div class="header">
    ${data.tenantLogoUrl ? `<img class="logo" src="${data.tenantLogoUrl}" />` : `<div></div>`}
    <div style="text-align:${isRtl ? 'left' : 'right'}">
      <div class="title">${data.tenantName}</div>
      <div class="ref">${isRtl ? 'رقم الحجز' : 'Booking Ref'}: ${data.bookingRef}</div>
    </div>
  </div>

  <div class="row"><span class="label">${isRtl ? 'العميل' : 'Customer'}</span><span class="value">${data.customerName}</span></div>
  <div class="row"><span class="label">${isRtl ? 'الخدمة' : 'Service'}</span><span class="value">${data.serviceName}</span></div>
  <div class="row"><span class="label">${isRtl ? 'التاريخ' : 'Date'}</span><span class="value">${data.appointmentDate}</span></div>
  <div class="row"><span class="label">${isRtl ? 'الوقت' : 'Time'}</span><span class="value">${data.appointmentTime}</span></div>
  ${data.location ? `<div class="row"><span class="label">${isRtl ? 'الموقع' : 'Location'}</span><span class="value">${data.location}</span></div>` : ''}
</body>
</html>`;
}
```

Rules for the agent:
- Always set `<html dir="rtl">` (not just CSS `direction: rtl`) when the
  locale is Arabic — this fixes flex-direction and text alignment defaults
  properly across the whole document.
- Web fonts: `page.setContent()` does not wait for `@font-face` fonts to load
  by default. Either embed fonts as base64 `data:` URIs directly in the
  `@font-face` src, or explicitly wait for fonts (see §4) — otherwise the PDF
  silently falls back to system fonts, which breaks Arabic glyphs.
- Never interpolate raw user input directly into the HTML string without
  escaping — this is a template rendering into a headless browser, so
  unescaped input is an XSS/injection vector even though "no visible browser"
  makes it feel safe. Escape or sanitize any free-text fields (customer notes,
  etc.) before interpolation.
- Use `@page { size: A4; margin: 0; }` in CSS and handle margins via
  `page.pdf({ margin })` OR via CSS body padding — pick one, not both, to
  avoid doubled spacing.

---

## 4. The route handler

```ts
// app/api/appointments/[id]/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBrowser } from '@/lib/pdf/browser';
import { renderAppointmentHtml } from '@/lib/pdf/templates/appointment';
import { getBookingForPdf } from '@/lib/bookings/service';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const booking = await getBookingForPdf(params.id);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const html = renderAppointmentHtml(booking);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready'); // ensures custom fonts painted before printing

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
    });

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="appointment-${booking.bookingRef}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[pdf] generation failed', err);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  } finally {
    await page.close();
  }
}
```

Rules for the agent:
- Always `await page.evaluateHandle('document.fonts.ready')` (or equivalent)
  before `page.pdf()` when custom fonts are used — `networkidle0` alone does
  not guarantee font rendering has completed.
- Always return `Cache-Control: no-store` for personalized documents (booking
  details are per-user, must not be cached/shared).
- Filenames in `Content-Disposition` should avoid special characters/Arabic
  text directly (some browsers mishandle non-ASCII filenames) — either
  transliterate or use the RFC 5987 `filename*=UTF-8''...` form if Arabic
  filenames are a hard requirement.

---

## 5. Multi-tenant / high-concurrency variant (BullMQ)

If PDF generation could be triggered at volume across tenants (bulk exports,
end-of-day batch invoices, etc.), don't generate synchronously in the request
path. Queue it instead:

```ts
// lib/pdf/queue.ts
import { Queue } from 'bullmq';

export const pdfQueue = new Queue('pdf-generation', {
  connection: { host: process.env.REDIS_HOST, port: 6379 },
});

// Producer (in the API route that triggers generation)
await pdfQueue.add('appointment-pdf', { bookingId: params.id, tenantId });
```

```ts
// worker/pdf-worker.ts
import { Worker } from 'bullmq';
import { getBrowser } from '@/lib/pdf/browser';
import { renderAppointmentHtml } from '@/lib/pdf/templates/appointment';
import { uploadToStorage } from '@/lib/storage';

new Worker('pdf-generation', async (job) => {
  const booking = await getBookingForPdf(job.data.bookingId);
  const html = renderAppointmentHtml(booking);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');
    const buffer = await page.pdf({ format: 'A4', printBackground: true });

    const url = await uploadToStorage(buffer, `pdfs/${job.data.tenantId}/${booking.bookingRef}.pdf`);
    return { url };
  } finally {
    await page.close();
  }
}, { connection: { host: process.env.REDIS_HOST, port: 6379 }, concurrency: 3 });
```

Rules for the agent:
- Cap `concurrency` on the worker (2-4 is reasonable) — each concurrent job
  opens a `page` on the same shared browser; too much concurrency exhausts
  container memory.
- Store the result (S3/DigitalOcean Spaces) and return a signed URL rather
  than pushing the PDF bytes through the job result/websocket — job payloads
  should stay small.
- Notify the client of completion via whatever channel this project already
  uses for async job status (existing inbox/notification pattern), not by
  polling in a tight loop.

---

## 6. Docker / DOKS deployment checklist

The agent should verify or add these when touching the Dockerfile:

```dockerfile
FROM node:20-slim

# Chromium runtime dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 \
    libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 \
    libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
    libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
    lsb-release wget xdg-utils \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# For Arabic text rendering, add fonts explicitly if not embedding via @font-face
RUN apt-get update && apt-get install -y fonts-noto fonts-noto-cjk --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
```

Kubernetes pod checklist:
- Set memory **requests** to at least 300-400MB per pod above baseline app
  usage (each idle Chromium instance + a few open pages adds up fast) and set
  a **limit** with headroom — OOMKilled pods from Chromium spikes are the
  most common failure mode here.
- Either mount a larger `/dev/shm` (`emptyDir` volume with `medium: Memory`,
  sized ~256-512MB) or keep `--disable-dev-shm-usage` — don't skip both.
- Liveness/readiness probes should not depend on Chromium being launched
  (lazy-launch on first request, as in §2, so pod startup isn't blocked on
  browser boot).
- If using `ghcr.io/puppeteer/puppeteer` as a base image instead of building
  deps manually, note it runs as a non-root user by default — align
  Kubernetes `securityContext` (runAsNonRoot, fsGroup) accordingly.

---

## 7. Common failure modes to check for when reviewing generated code

- Browser launched inside the request handler instead of reused → flag and
  fix, this is the #1 performance issue.
- Missing `--disable-dev-shm-usage` in a containerized deploy → flag.
- Font-dependent content printed without waiting on `document.fonts.ready` →
  flag, especially for Arabic/custom fonts.
- Unescaped dynamic data interpolated into the HTML template → flag as an
  injection risk.
- No `finally { page.close() }` → flag as a resource leak.
- Synchronous PDF generation on a route that could be hit in bulk/batch
  without any queueing → suggest the BullMQ variant.
- `Content-Disposition` filename containing raw non-ASCII text without
  RFC 5987 encoding → flag as a cross-browser compatibility risk.
