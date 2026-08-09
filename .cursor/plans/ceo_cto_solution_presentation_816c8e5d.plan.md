---
name: CEO/CTO Solution Presentation
overview: Build an English HTML (reveal.js) slide deck in the presentation/ directory that presents the Toyota Smart Gate solution — Kiosk/AI Agent module and Queue Management module — with mermaid diagrams, open questions for the CEO/CTO, and a 6-week Phase 1 timeline.
todos:
  - id: deck-skeleton
    content: Create presentation/index.html with reveal.js + mermaid setup and custom executive theme
    status: completed
  - id: kiosk-slides
    content: Write Module 1 (kiosk/AI agent) slides with conversation flow diagrams
    status: completed
  - id: queue-slides
    content: Write Module 2 (queue) slides with notification logic and sequence diagram
    status: completed
  - id: decisions-timeline
    content: Add open-questions slide and 6-week Gantt timeline + Phase 2 slide
    status: completed
  - id: polish-verify
    content: Polish design, add speaker notes, verify deck renders in browser
    status: in_progress
  - id: readme
    content: Add presentation/README.md with present/export instructions
    status: completed
isProject: false
---

# CEO/CTO Solution Presentation (HTML Deck)

## Deliverable

A self-contained reveal.js slide deck at `presentation/index.html` (reveal.js + mermaid via CDN, single file for portability — present in any browser, export to PDF with `?print-pdf`). Content is sourced from [toyota-gate-queue-system-design.md](toyota-gate-queue-system-design.md) plus the flow details you described (SAP webhook after LPR, owner-vs-driver question, voice phone capture with speech-to-text verification).

I will follow the `frontend-design` skill to make the deck look polished and executive-grade (dark theme, Toyota-style accent color, consistent typography), and add speaker notes on key slides.

## Slide outline (~16 slides)

1. **Title** — Toyota Smart Gate & Queue Management System, Phase 1 proposal
2. **The problem** — gate congestion, manual check-in, no visibility into slot availability, poor waiting experience
3. **The solution at a glance** — two modules: Kiosk (AI Agent) + Queue Management, one middleware brain
4. **High-level architecture** — mermaid diagram: LPR camera → middleware → SAP lookup/webhook → kiosk avatar → queue engine → slot availability system → notifications (WhatsApp/SMS/app)
5. **Module 1: Kiosk entry flow (known customer)** — LPR reads plate → SAP returns customer → avatar greets by name: "Is that you?" → confirm → gate opens, event fired, customer enqueued
6. **Module 1: Driver-not-owner flow** — "Are you the owner of this car?" → if no, avatar asks the driver to speak their phone number → speech-to-text captures it → number read back for confirmation → enqueued with the visit-only number (SAP record untouched)
7. **Kiosk conversation flow diagram** — mermaid flowchart covering found/not-found in SAP, confirm/deny, voice phone capture retry loop, staff escalation cap
8. **The voice AI pipeline** — speech-to-text → LLM (conversation brain) → text-to-speech → animated avatar; on-prem options (Vosk/faster-whisper, Piper) vs cloud APIs
9. **Module 2: Queue management** — what it does: track everyone through the gate, slot count and availability, assign slots fairly
10. **Queue notification logic** — 50-second claim window, WhatsApp confirmation as source of truth, growing push-back on consecutive no-shows (with the worked `[1,2,3,4]` example from the design doc)
11. **Queue sequence diagram** — mermaid sequence: slot frees → notify → confirm/timeout → shift → next
12. **Reliability & concurrency** — atomic enqueue/pop across N gates, idempotent events, single source of truth, audit trail, offline kiosk fallback
13. **Proposed tech stack** — condensed version of design doc §5 (Android kiosk shell, NestJS middleware, Redis queue + BullMQ timers, Postgres audit, MQTT for devices, Docker Compose on-prem)
14. **Open questions for this room** — the decisions we need from CEO/CTO:
    - Kiosk platform: Windows, Ubuntu, or Android?
    - AI agent: integrate a hosted LLM/voice via APIs, or build the full on-prem pipeline (LLM + TTS + STT) ourselves?
    - Slot Availability System contract: webhook push or polling?
    - LPR read-failure path: same as "not a client" or a staff-assist path?
15. **6-week Phase 1 timeline** — mermaid Gantt:
    - W1: infrastructure, middleware skeleton, integration contracts (SAP, LPR, slot system)
    - W2–3: Kiosk module — voice pipeline, conversation flows, gate control
    - W3–4: Queue engine, timers, WhatsApp/SMS notifications
    - W5: end-to-end integration, edge cases, ops dashboard basics
    - W6: on-site pilot at one gate, hardening, handover
16. **Phase 2 preview & next steps** — exit flow, multi-branch, analytics dashboard; what we need to start (hardware access, SAP API credentials, WhatsApp Business account)

## Files

- `presentation/index.html` — the full deck (reveal.js + mermaid from CDN, custom CSS inline)
- `presentation/README.md` — how to open/present/export to PDF
