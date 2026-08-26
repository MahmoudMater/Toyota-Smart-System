# Toyota Smart Gate & Queue Management System — Solution Design

**Scope:** single branch, multiple entry gates (each with LPR camera + kiosk display), one shared queue, one middleware. Exit flow and multi-branch scale are out of scope for this version. Module 1 supports **two presentable approaches**: voice/avatar (Approach A) and QR check-in (Approach B).

---

## 1. System Actors & Components

| Component | Role |
|---|---|
| **LPR Camera** (one per gate) | Reads the plate as a car approaches, sends the plate number to the middleware. |
| **Kiosk display** (one per gate) | Approach A: voice-driven avatar UI. Approach B: large QR + Welcome name + status. |
| **Driver phone** | Opens the public `/checkin` form from a QR (Approach B). |
| **Gate controller** | Physical barrier. Opens on command from the middleware. |
| **Middleware** | The brain. Talks to every gate, talks to SAB, owns check-in tickets and voice sessions, owns the queue, owns notifications. |
| **SAB** | Toyota's existing client database. Exposed to the middleware via API (read: lookup by plate; the exact contract is external/pre-existing). |
| **Slot Availability System** | A separate existing system that tells the middleware how many garage slots are currently free (assumed to expose an API/webhook — see Open Questions). |
| **Queue Engine** | The single shared FIFO-with-skip queue described in Module 2. |
| **Notification Service** | Sends SMS / WhatsApp / Toyota app push, and listens for confirmations. |

---

## 2. Module 1 — Gate entry (Approach A — Avatar / AI Agent)

### 2.1 Plate found in SAB (known client)

1. Car approaches Gate `X`. Barrier is closed.
2. Camera at Gate `X` performs LPR, sends `{gate_id, plate_number, timestamp, image}` to the middleware.
3. Middleware calls **SAB** with the plate number.
4. SAB returns a match → client record (name, phone, vehicle info, etc.).
5. Middleware pushes the client record to the kiosk at Gate `X` over its real-time channel.
6. Kiosk avatar greets the client by name, shows their info, and asks (by voice) to confirm the phone number on file — e.g. *"is this your number, XXX-XXX-XXXX?"*
7a. **Client confirms it's correct:**
   - Gate opens (open-gate command to Gate `X`'s controller).
   - Client is enqueued into the shared queue with `{gate_id, plate_number, phone, entry_timestamp}` — the phone number on file is used.
7b. **Client says it's not their number:**
   - This covers cases like the car being driven by someone other than the account holder (e.g. a driver) — we still want a working number for *this visit's* queue notification.
   - Avatar asks the client to enter their correct phone number via the kiosk touch input.
   - Middleware displays the entered number back on screen and asks for confirmation.
   - On confirmation: gate opens and the client is enqueued the same way, using the **entered number** for this visit's notification only. This does **not** overwrite the phone number on the SAB record — the SAB record still belongs to the account holder, not whoever happens to be driving that day.
   - On rejection / re-entry: loop back to "please enter your number," capped at a few retries before alerting staff via the ops dashboard.

### 2.2 Plate not found in SAB

1. Steps 1–3 same as above.
2. SAB returns no match.
3. This car is **not one of our clients** — the gate stays **closed**. No manual entry, no guest flow. The kiosk can show a simple message (e.g. "not recognized, please see staff") but does not open the gate or add anything to the queue.

### 2.3 Edge cases

| Case | Handling |
|---|---|
| LPR fails to read plate (glare, dirty plate, no plate) | No plate number means no SAB lookup is possible — under the new rule this falls under "not found," so the gate stays closed by default. **Flagging this as worth a second look**: you may want a distinct path here (e.g. retry the read, or route to staff) rather than treating a camera failure identically to "confirmed not a client" — your call, see Open Questions. |
| Same plate is re-scanned at the same gate within a short window (car idling, re-triggering the sensor) | Middleware de-dupes by `(plate_number, active_session)` — don't re-enqueue if the client already has an open queue entry. |
| Same plate scanned at **two different gates** near-simultaneously | Enqueue is idempotent per plate; first write wins, second is rejected with a "already queued" response shown briefly on the second kiosk. |
| Client keeps saying "that's not my number" past a few retries | Loop is capped at a few attempts, then the ops dashboard is alerted so staff can step in — same as before. |
| SAB unreachable | Gate stays closed, per your existing rule for SAB/middleware failures. |
| Kiosk network drop mid-flow | Kiosk caches the session locally and retries; if it can't reach the middleware within a timeout, it shows a "please wait, calling staff" fallback. |

### 2.4 Approach B — QR check-in

An alternate Module 1 path for the same LPR → SAB → enqueue → Module 2 claim story. Useful when voice hardware or latency is undesirable, or as a parallel demo.

**Path A — Generic QR (always on):** Printed or idle kiosk shows `https://{public}/checkin?gate={gateId}`. Empty form; driver types plate, name, phone. Submit → enqueue + open **that** gate (subject to rate limit).

**Path B — LPR + SAB miss:** Middleware mints an opaque Redis token (TTL ~3 minutes, single use). Kiosk swaps to a token URL. Form prefills **plate only** (editable). Name and phone empty.

**Path C — LPR + SAB hit:** Same token mint with `plateLocked: true`, name + phone prefilled (editable). Kiosk shows `Welcome, {name}` + QR (no phone on the glass).

Settled rules for Approach B:

- Gate opens on **successful new-plate submit**, not on LPR alone.
- **At most one gate-open per gate per ~30s**. Extra new plates still enqueue; they do not fire another open until the window passes.
- Duplicate plate already waiting → reject (no second entry, do not open again).
- Edited name/phone are **visit-only** — no SAB write-back.
- Token never embeds PII; phone loads `/checkin?gate=…&t=…` then `GET`s the ticket over HTTPS.
- After enqueue, Module 2 (slot free → WhatsApp/SMS/app claim) is **unchanged**.

---

## 3. Module 2 — Queue Management System

### 3.1 Data model (conceptual)

Each queue entry holds: `id, plate_number, phone, client_type (known/guest), gate_id (entry gate), enqueued_at, status (waiting/notified/confirmed/skipped/parked), notified_at, notify_attempt_count`.

### 3.2 Trigger: a slot becomes free

- The **Slot Availability System** informs the middleware that a slot is now open (assumed via webhook/event — cleanest — or polling if that system only exposes a "current count" endpoint).
- Middleware asks the **queue engine** for "next eligible entry" (see 3.3).

### 3.3 Notification & timeout logic

This is a **priority queue with a 50-second claim window**, where each consecutive no-show pushes that person back one position *further* than the previous no-show did. Walkthrough, matching your example:

1. Queue state: `[1, 2, 3, 4]`.
2. A slot opens → middleware notifies **1** on all three channels (SMS + WhatsApp + Toyota app) simultaneously, starts a 50s timer.
3. **If 1 does not confirm (via WhatsApp) within 50s:** 1 is pushed back **1** position → queue becomes `[2, 1, 3, 4]`. Middleware notifies **2**, starts a new 50s timer.
4. **If 2 also times out:** 2 is pushed back **2** positions this time (one more than the previous shift) → queue becomes `[3, 1, 2, 4]`. Middleware notifies **3**.
5. **If 3 confirms:** 3 is popped from the queue entirely → `[1, 2, 4]` remain. Slot is assigned to 3. Done — no physical arrival check needed; a confirmed click is treated as a guaranteed arrival.
6. If 3 had also timed out, 3 would push back **3** positions, and so on — the push distance grows by one with every additional consecutive no-show for that slot, then resets once someone confirms.
7. There is **no cap on retries** — a client that keeps missing their notification simply keeps cycling through the queue indefinitely; no escalation to staff.

- **Confirmation source of truth:** only a reply/button-tap on the **WhatsApp** message counts as a confirmation. SMS and the Toyota app notification are sent in parallel purely as extra pings — nothing in the logic depends on their delivery or read status.
- Only **one entry is ever in `notified` state at a time** per slot, since slots are filled one at a time in this scenario. If multiple slots free up concurrently, the same logic runs in parallel per slot, with the queue engine ensuring two concurrent notify/timeout cycles can never both claim the same slot or double-shift the same entry.

### 3.4 Concurrency across many gates, one queue

Because *every* gate's entries land in the *same* queue, and slots can free up while cars are simultaneously entering through several gates, the queue engine must guarantee:

- **Atomic enqueue** — two gates enqueuing at the "same instant" never corrupt order or double-insert.
- **Atomic pop/notify** — two "slot freed" events arriving close together must never notify the same person twice or assign the same slot twice.
- **A single source of truth for queue state** — no per-gate local queue state; every gate/kiosk reads live state from the middleware.

This is a solved problem with the right primitive (see tech stack — Redis's atomic list/sorted-set operations, or Postgres row-level locking with `SELECT ... FOR UPDATE SKIP LOCKED`).

### 3.5 Edge cases

| Case | Handling |
|---|---|
| Client confirms *after* the 50s window already expired and gate reassigned | Reject the late confirmation, show "sorry, this slot's been given up — you're back in the queue" in the WhatsApp reply. |
| Client never confirms, keeps cycling through the queue | By design — no cap, no escalation. They simply keep getting notified and pushed back further each time. |
| Client's car already left the property while still "waiting" in queue | Out of scope since exit isn't handled — flagged as a future gap only, not addressed here. |
| Multiple slots free up at once | Notify the top-N eligible entries in parallel, each with its own 50s timer and its own slot reservation, so two confirmations can't collide on one slot. |
| WhatsApp message fails to deliver (bad number, not installed) | No fallback confirmation path — since only WhatsApp counts as confirmation, this client will time out and be pushed back like any other no-show. SMS/App still get sent as informational pings. |
| SAB or middleware unreachable | Gate stays closed. No auto-open fallback. |

---

## 4. Cross-module flow summary

```
Car arrives → LPR reads plate → Middleware checks SAB
   ├─ Found → show profile + phone on kiosk
   │            ├─ client confirms number → open gate → enqueue
   │            └─ client says wrong number → enter/confirm new number → open gate → enqueue
   └─ Not found → gate stays closed (not a client)

Slot Availability System → "slot free" event → Middleware
   → Queue engine picks next eligible entry → notify all 3 channels → 50s timer
        ├─ WhatsApp confirms in time → pop, assign slot (guaranteed arrival, no physical check)
        └─ timeout → push back further than last shift, notify next entry, repeat
```

---

## 5. Recommended Tech Stack — Module 1 & Module 2 only

Given: **single branch, on-premise (no cloud provider), many physical gates, one shared queue, English-only voice avatar.** Only the two modules you own are covered here — SAB and the Slot Availability System are pre-existing.

| Piece | Recommendation | Why |
|---|---|---|
| **Kiosk app** (Module 1) | Android (Kotlin) kiosk-mode shell + WebView for the avatar UI | Kiosk lockdown, mic/speaker access, and fast UI iteration on the avatar without app-store-style redeploys. |
| **Speech-to-text** (Module 1) | Vosk, or `faster-whisper` if you have a local server to offload inference to | Fully offline/on-prem, no cloud dependency, handles English well. Vosk is lighter if kiosk hardware is weak. |
| **Text-to-speech** (Module 1) | Piper TTS, self-hosted | Open-source, on-prem, natural English voice, low latency. |
| **Avatar animation** (Module 1) | Rive or Lottie, lip-synced to TTS audio amplitude | Lightweight 2D, runs fine inside a WebView on kiosk-grade hardware. |
| **Camera & gate transport** (Module 1) | MQTT (Mosquitto broker, on-prem) | Standard lightweight pub/sub for many physical devices (N cameras, N gate controllers) on a local network, tolerant of flaky links. |
| **Kiosk ↔ middleware live channel** (Module 1) | WebSocket (Socket.io) | Push client profile / confirmation prompts to the correct kiosk in real time. |
| **Middleware / API** (shared) | Node.js + NestJS (TypeScript) | Handles many concurrent gate/kiosk connections cleanly; one codebase for both modules since they share live state. |
| **Queue engine** (Module 2) | Redis, single on-prem instance | Model the queue as a Redis **List**; use `LREM` + `LINSERT` inside a Lua script/`MULTI` to make "remove and reinsert at position N" atomic — required since a slot-free event and a no-show timer can fire close together across gates. |
| **50s timers & shift logic** (Module 2) | BullMQ (Node, Redis-backed) delayed jobs | One delayed job per notify event; on fire, checks the WhatsApp confirmation flag and either pops the entry or runs the shift-and-renotify step. |
| **Notifications** (Module 2) | WhatsApp Business Cloud API (authoritative — confirmation via webhook), plus SMS gateway and Firebase Cloud Messaging fired in parallel as pings only | Only the WhatsApp webhook is treated as ground truth; SMS/FCM delivery status doesn't affect the logic. |
| **Persistence** (both) | PostgreSQL | Durable audit trail: every notify/timeout/shift/confirm event, guest records, gate/kiosk registry. Redis holds live state, Postgres holds history. |
| **Deployment** | Docker Compose on a local server at the branch | Matches on-prem/single-branch scope, no need for full Kubernetes at this scale. |

---

## 6. Non-Functional Notes

- **Reliability at the gate**: since a closed gate blocks a physical car, every gate/kiosk should have a sane offline fallback (cached "please wait" state, manual staff override) rather than hanging indefinitely if the middleware is briefly unreachable.
- **Idempotency**: every plate-read and every slot-free event should be processed idempotently (dedupe keys) since physical sensors and network retries will occasionally double-fire.
- **Auditability**: every queue transition (notified, confirmed, timed-out, requeued) should be logged with timestamps — useful both for debugging and for staff disputes ("I was notified but didn't get the message").
- **Security**: gates/kiosks authenticate to the middleware (e.g. per-device API key or mTLS on the local network), admin dashboard behind proper auth (JWT + roles).

---

## 7. Resolved Decisions

- **Queue requeue on timeout**: each consecutive no-show pushes that entry back one position further than the previous no-show did (see §3.3). Resets once someone confirms.
- **Confirmation source of truth**: WhatsApp only. SMS and Toyota app notifications are informational pings with no logic attached.
- **Retry ceiling**: none — clients cycle indefinitely if they keep missing notifications, no staff escalation.
- **Arrival confirmation**: not checked physically. A WhatsApp confirmation is treated as a guaranteed arrival.
- **SAB/middleware failure**: gate stays closed, no auto-open fallback.
- **Guest (non-SAB) records**: no longer applicable — a plate not found in SAB is not a client, gate stays closed, nothing is created or enqueued.
- **Blacklist/flagged plates**: out of scope — not specially handled by this system.

## 8. Still Open

1. **Slot Availability System contract** — API shape (webhook push vs. poll) is unknown until you confirm with that system's owner. The middleware is designed to accept either, but the integration can't be finalized until this is known.
2. **LPR read failure** (camera can't extract a plate at all — glare, dirt, no plate) — currently defaults to "gate stays closed" since there's no plate to look up. Worth confirming whether this should really be identical to "confirmed not a client," or whether a failed read deserves a different path (retry, route to staff) since it's a camera/environmental issue rather than an actual non-client vehicle.
