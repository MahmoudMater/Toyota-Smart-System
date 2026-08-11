/**
 * Beyond Presence / LiveKit room helper for kiosk UIs.
 * Expects livekit-client UMD global `LivekitClient`.
 */
(function (global) {
  "use strict";

  function createBeyRoomController({ videoEl, statusEl, onError }) {
    let room = null;
    let currentRoomName = null;
    let connectGen = 0;
    let intentionalDisconnect = false;

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg;
    }

    function attachTrack(track) {
      if (!videoEl || !track) return;
      if (track.kind === "video" || track.kind === "audio") {
        track.attach(videoEl);
      }
    }

    function detachAll() {
      if (!videoEl) return;
      videoEl.srcObject = null;
      videoEl.removeAttribute("src");
    }

    async function connect({ url, token, room: roomName }) {
      if (!global.LivekitClient) {
        throw new Error("livekit-client not loaded");
      }
      // Reuse only if still connected to the same room (LiveKit ConnectionState)
      if (
        room &&
        currentRoomName === roomName &&
        (room.state === "connected" ||
          (global.LivekitClient.ConnectionState &&
            room.state === global.LivekitClient.ConnectionState.Connected))
      ) {
        return room;
      }

      const gen = ++connectGen;
      await disconnect();

      const { Room, RoomEvent, Track, ConnectionState } = global.LivekitClient;
      const next = new Room({ adaptiveStream: true, dynacast: true });
      room = next;
      currentRoomName = roomName;

      next.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (room !== next || gen !== connectGen) return;
        const id = (participant?.identity || "").toLowerCase();
        // Prefer Beyond Presence avatar participant for video
        if (track.kind === Track.Kind.Video) {
          if (id.includes("bey") || id.includes("avatar") || !videoEl.srcObject) {
            attachTrack(track);
            setStatus(`bey video · ${participant.identity}`);
          }
        } else if (track.kind === Track.Kind.Audio) {
          attachTrack(track);
        }
      });

      next.on(RoomEvent.Disconnected, (reason) => {
        // Ignore leave we triggered ourselves, and stale rooms after reconnect.
        if (intentionalDisconnect || room !== next || gen !== connectGen) return;
        room = null;
        currentRoomName = null;
        detachAll();
        const why =
          reason != null && reason !== ""
            ? ` (${reason})`
            : "";
        setStatus(`livekit disconnected${why}`);
        if (typeof onError === "function") {
          onError(new Error(`LiveKit disconnected${why}`));
        }
      });

      await next.connect(url, token);
      if (gen !== connectGen || room !== next) {
        try {
          await next.disconnect();
        } catch (_) {
          /* superseded */
        }
        return room;
      }

      const stateLabel =
        ConnectionState && next.state === ConnectionState.Connected
          ? "connected"
          : next.state || "joined";
      setStatus(`livekit · ${roomName} · ${stateLabel}`);

      // Attach already-published tracks (agent may have joined first)
      for (const p of next.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (pub.track) attachTrack(pub.track);
        }
      }
      return next;
    }

    async function disconnect() {
      const prev = room;
      if (!prev) {
        currentRoomName = null;
        return;
      }
      intentionalDisconnect = true;
      room = null;
      currentRoomName = null;
      try {
        await prev.disconnect();
      } catch (_) {
        /* ignore */
      } finally {
        intentionalDisconnect = false;
      }
      detachAll();
    }

    function showBey(show) {
      if (!videoEl) return;
      videoEl.classList.toggle("hidden", !show);
    }

    return { connect, disconnect, showBey, setStatus };
  }

  global.TamkeenBey = { createBeyRoomController };
})(window);
