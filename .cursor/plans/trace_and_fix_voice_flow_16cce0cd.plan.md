---
name: Trace and Fix Voice Flow
overview: Trace the end-to-end voice and session flow from SAP registration and LPR plate read to ElevenLabs TTS/STT and canvas avatar playback, fixing configuration mismatches and session synchronization issues.
todos:
  - id: fix-elevenlabs-config
    content: Fix ElevenLabs TTS & STT model IDs in middleware/.env, env.validation.ts, and .env.example
    status: completed
  - id: gateway-session-sync
    content: Update KioskGateway to push active session on socket join
    status: completed
  - id: enhance-console-avatar
    content: Enhance ConsoleApp & KioskAvatar for reliable audio playback and error handling
    status: completed
  - id: verify-voice-flow
    content: "Verify end-to-end flow: SAP save -> LPR plate read -> Visit session -> ElevenLabs audio speech"
    status: completed
isProject: false
---

# Voice and Session Flow Architecture & Fix Plan

## 1. End-to-End Flow Trace

The diagram below illustrates the complete architecture and runtime flow from SAP profile registration and LPR plate ingestion to ElevenLabs voice synthesis and browser playback.

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Browser
    participant Console as ConsoleApp (Next.js)
    participant KioskAvatar as KioskAvatar (Canvas + WebAudio)
    participant Nest as NestJS Middleware (:3000)
    participant Redis as Redis (:6379)
    participant ElevenLabs as ElevenLabs API

    Note over User,Console: Step 1: Register SAP Profile
    User->>Console: Enter Name, Phone, Plate & Click "Save SAP profile"
    Console->>Nest: POST /demo/sap-profile
    Nest->>Redis: SET demo:sap:<PLATE> (JSON)
    Nest-->>Console: 200 OK (Profile saved)

    Note over User,Console: Step 2: Trigger LPR Plate Read
    User->>Console: Click "Send plate read"
    Console->>Nest: POST /lpr/plate-read { gateId, plateNumber }
    Nest->>Redis: GET lpr:active:<PLATE> (Deduplication Check)
    alt Plate already active in Redis
        Nest-->>Console: { accepted: false, reason: "already_queued_or_active" }
    else Plate accepted
        Nest->>Redis: SETEX lpr:active:<PLATE> 120 (lpr_dedupe)
        Nest->>Nest: Emit DomainEvents.LprPlateRead
        Nest-->>Console: { accepted: true, plateNumber, gateId }
    end

    Note over Nest: Step 3: SAP Lookup & Session Creation
    Nest->>Nest: SapService handles LprPlateRead
    Nest->>Redis: GET demo:sap:<PLATE>
    Nest->>Nest: Emit DomainEvents.SapLookupFound
    Nest->>Nest: KioskService handles SapLookupFound
    Nest->>Redis: Save session (kiosk:session:<ID>, kiosk:gate:<GATE>:active)
    Nest->>Redis: SETEX lpr:active:<PLATE> 3600 (kiosk_session)
    Nest->>Nest: KioskGateway pushes "session.update" to room "gate:<GATE>"

    Note over Console,KioskAvatar: Step 4: Voice Synthesis & Playback
    Nest-->>Console: Socket event: "session.update" (PublicSession)
    Console->>Console: Update session state & prompt
    Console->>Nest: POST /tts { text: prompt.speech, lang: "en" }
    Nest->>Redis: GET tts:cache:<HASH>
    alt Cache Miss
        Nest->>ElevenLabs: POST /v1/text-to-speech/:voiceId (model_id: eleven_multilingual_v2)
        ElevenLabs-->>Nest: MP3 Audio Buffer
        Nest->>Redis: SETEX tts:cache:<HASH> 86400 (audio buffer)
    end
    Nest-->>Console: 200 OK (audio/mpeg stream)
    Console->>KioskAvatar: playAndLipSync(buffer, audioEl, contentType)
    KioskAvatar->>KioskAvatar: Resume AudioContext & connect AnalyserNode
    KioskAvatar->>User: Play audio through speaker & animate canvas mouth
```

---

## 2. Root Cause Analysis

1. **Invalid ElevenLabs Model IDs in Environment & Validation Schema**:
   - `[middleware/.env](middleware/.env)` configured `ELEVENLABS_TTS_MODEL_ID=eleven_v3` and `ELEVENLABS_STT_MODEL_ID=scribe_v2`.
   - `eleven_v3` and `scribe_v2` do not exist in ElevenLabs public API. ElevenLabs returns `HTTP 400 (invalid_model_id)` after 4 retry attempts with exponential backoff.
   - `[middleware/src/config/env.validation.ts](middleware/src/config/env.validation.ts)` and `[middleware/.env.example](middleware/.env.example)` also had default `eleven_v3` and `scribe_v2`.
   - Valid ElevenLabs models are `eleven_multilingual_v2` (or `eleven_turbo_v2_5`) for TTS, and `scribe_v1` for STT.

2. **Duplicate and Broken Environment Config**:
   - `[middleware/.env](middleware/.env)` has duplicate `CORS_ORIGINS` definitions.
   - TTS failure cascades to `speakText` in `[web/features/console/ConsoleApp.tsx](web/features/console/ConsoleApp.tsx)`, setting `TTS error: ...` on `sessionStatus` and preventing the avatar from speaking.

3. **Missing Active Session Sync on Socket Join**:
   - In `[middleware/src/modules/kiosk/kiosk.gateway.ts](middleware/src/modules/kiosk/kiosk.gateway.ts)`, when `kiosk.join` is received, it only returns and emits `checkin.display`, but does not emit existing active `session.update` for the gate. If a user connects or refreshes after a session starts, the session UI remains blank.

4. **LPR Plate Active Lock Handling**:
   - When testing repeatedly without clicking "Reset demo run", `LprService` rejects subsequent plate reads with `already_queued_or_active`. Adding a clear option or auto-clearing stale dedupe on explicit manual demo test ensures smooth testing.

5. **Browser Autoplay & Audio Graph Robustness**:
   - In `[web/components/avatar/KioskAvatar.tsx](web/components/avatar/KioskAvatar.tsx)`, audio errors or autoplay policy rejections need explicit catch/cleanup to prevent animation frame leaks or silent UI locks.

---

## 3. Proposed Fixes

### 1. Update Middleware Configuration & Validation
- Edit `[middleware/.env](middleware/.env)`:
  - Set `ELEVENLABS_TTS_MODEL_ID=eleven_multilingual_v2`
  - Set `ELEVENLABS_STT_MODEL_ID=scribe_v1`
  - Clean up duplicate `CORS_ORIGINS` line
- Edit `[middleware/src/config/env.validation.ts](middleware/src/config/env.validation.ts)`:
  - Update defaults for `ELEVENLABS_TTS_MODEL_ID` to `eleven_multilingual_v2` and `ELEVENLABS_STT_MODEL_ID` to `scribe_v1`.
- Edit `[middleware/.env.example](middleware/.env.example)`:
  - Update model IDs to match valid ElevenLabs endpoints.

### 2. Improve Gateway Session Synchronization
- In `[middleware/src/modules/kiosk/kiosk.gateway.ts](middleware/src/modules/kiosk/kiosk.gateway.ts)`:
  - On `kiosk.join`, check `this.kioskService.getSession` / `store.getActiveForGate(gateId)`.
  - Emit `session.update` if an active session exists so the client immediately displays the visit session.

### 3. Enhance Frontend Console Voice & Session Handling
- In `[web/features/console/ConsoleApp.tsx](web/features/console/ConsoleApp.tsx)`:
  - Provide clear status feedback when TTS is generating vs playing.
  - Add explicit audio context resume on user clicks (Connect / Save SAP / Send Plate Read).
  - Handle plate read rejection gracefully with a quick "Reset & retry" action if `already_queued_or_active` is returned.
- In `[web/components/avatar/KioskAvatar.tsx](web/components/avatar/KioskAvatar.tsx)`:
  - Add error listeners and promise rejection safety to `playAndLipSync` to prevent hanging promises on audio decoding or autoplay failures.

---

## 4. Verification Plan

1. Verify environment schema and compilation: run NestJS and Next.js builds.
2. Test `/tts` endpoint directly via HTTP POST with `text` and `lang` to confirm ElevenLabs returns valid audio buffer.
3. Test full browser flow:
   - Save SAP profile for "Mahmoud Mater" (`TKN 9001`).
   - Click "Send plate read".
   - Verify `DomainEvents.LprPlateRead` -> `SapLookupFound` -> `KioskSessionStarted` -> `session.update` socket event.
   - Verify avatar receives audio, plays voice via ElevenLabs TTS, and animates mouth lip sync on the canvas.
   - Click "Yes" / "No" or use "Hold to speak" for STT.