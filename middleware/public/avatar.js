/**
 * Avatar + amplitude lip sync.
 * Tries Rive when a .riv URL / global Rive runtime is available;
 * otherwise uses a canvas face with mouthOpen driven by AnalyserNode.
 */
(function (global) {
  "use strict";

  const STATES = { idle: "idle", talking: "talking", listening: "listening" };

  function createCanvasAvatar(canvas) {
    const ctx = canvas.getContext("2d");
    let visualState = STATES.idle;
    let mouthOpen = 0;
    let listenPulse = 0;
    let raf = 0;

    function draw() {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Atmosphere
      const g = ctx.createRadialGradient(w * 0.5, h * 0.4, 20, w * 0.5, h * 0.5, w * 0.55);
      g.addColorStop(0, "#2f4a3a");
      g.addColorStop(1, "#121c16");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Head
      ctx.fillStyle = "#d8c4a8";
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.48, w * 0.28, h * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      const eyeY = h * 0.42;
      const blink = visualState === STATES.idle && Math.sin(Date.now() / 400) > 0.97 ? 0.15 : 1;
      ctx.fillStyle = "#1b241f";
      ctx.beginPath();
      ctx.ellipse(w * 0.38, eyeY, 10, 10 * blink, 0, 0, Math.PI * 2);
      ctx.ellipse(w * 0.62, eyeY, 10, 10 * blink, 0, 0, Math.PI * 2);
      ctx.fill();

      // Listening ring
      if (visualState === STATES.listening) {
        listenPulse = (listenPulse + 0.04) % (Math.PI * 2);
        ctx.strokeStyle = `rgba(196, 163, 90, ${0.35 + 0.25 * Math.sin(listenPulse)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.48, w * 0.34 + 4 * Math.sin(listenPulse), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Mouth (driven by mouthOpen 0..1)
      const open = Math.max(0, Math.min(1, mouthOpen));
      const mouthW = 36 + open * 8;
      const mouthH = 4 + open * 28;
      ctx.fillStyle = "#5a2e2a";
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.62, mouthW * 0.5, mouthH * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // State badge (idle / talking / listening)
      ctx.fillStyle = "rgba(232, 240, 234, 0.85)";
      ctx.font = "600 12px DM Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(visualState).toUpperCase(), w * 0.5, h * 0.92);

      raf = requestAnimationFrame(draw);
    }

    draw();

    return {
      setState(next) {
        visualState = STATES[next] || STATES.idle;
        if (visualState !== STATES.talking) mouthOpen = visualState === STATES.listening ? 0.05 : 0;
      },
      setMouthOpen(v) {
        mouthOpen = v;
      },
      destroy() {
        cancelAnimationFrame(raf);
      },
    };
  }

  function createRiveAvatar(canvas, src) {
    if (!global.rive || !src) return null;
    try {
      let mouthInput = null;
      let stateInputs = {};
      const r = new global.rive.Rive({
        src,
        canvas,
        autoplay: true,
        stateMachines: "State Machine 1",
        onLoad: () => {
          const smName = (r.stateMachineNames && r.stateMachineNames[0]) || "State Machine 1";
          const inputs = r.stateMachineInputs ? r.stateMachineInputs(smName) : [];
          for (const input of inputs || []) {
            stateInputs[input.name] = input;
            if (input.name === "mouthOpen") mouthInput = input;
          }
        },
      });
      return {
        setState(next) {
          // Optional boolean inputs named idle/talking/listening on the .riv
          for (const name of ["idle", "talking", "listening"]) {
            const input = stateInputs[name];
            if (input && "value" in input) input.value = name === next;
          }
        },
        setMouthOpen(v) {
          if (mouthInput && "value" in mouthInput) {
            const max = typeof mouthInput.value === "number" && mouthInput.value > 1 ? 100 : 1;
            mouthInput.value = Math.max(0, Math.min(1, v)) * max;
          }
        },
        destroy() {
          r.cleanup?.();
        },
      };
    } catch (err) {
      console.warn("Rive init failed, using canvas avatar", err);
      return null;
    }
  }

  class AvatarController {
    constructor({ canvas, riveCanvas, statusEl, riveSrc }) {
      this.statusEl = statusEl;
      this.audioCtx = null;
      this.analyser = null;
      this.source = null;
      this.raf = 0;
      this.visualState = STATES.idle;

      // Default: canvas implements mouthOpen + idle/talking/listening (plan Stage 4 contract).
      // Optional: pass riveSrc to a .riv that exposes mouthOpen (+ optional state inputs).
      if (riveCanvas) riveCanvas.classList.add("hidden");
      canvas.classList.remove("hidden");
      const canvasImpl = createCanvasAvatar(canvas);
      this.impl = canvasImpl;
      this._setStatus("canvas avatar (AnalyserNode lip sync)");

      if (riveSrc && global.rive) {
        fetch(riveSrc, { method: "HEAD" })
          .then((res) => {
            if (!res.ok) throw new Error("no riv");
            const rive = createRiveAvatar(riveCanvas, riveSrc);
            if (!rive || !riveCanvas) return;
            riveCanvas.classList.remove("hidden");
            canvas.classList.add("hidden");
            this.impl = {
              setState: (s) => {
                canvasImpl.setState(s);
                rive.setState(s);
              },
              setMouthOpen: (v) => {
                canvasImpl.setMouthOpen(v);
                rive.setMouthOpen(v);
              },
              destroy: () => {
                canvasImpl.destroy();
                rive.destroy();
              },
            };
            this._setStatus("rive + canvas lip sync");
          })
          .catch(() => {
            this._setStatus("canvas avatar (no avatar.riv — Rive optional)");
          });
      }
    }

    _setStatus(msg) {
      if (this.statusEl) this.statusEl.textContent = `avatar: ${this.visualState} — ${msg}`;
    }

    setState(state) {
      this.visualState = STATES[state] || STATES.idle;
      this.impl.setState(this.visualState);
      this._setStatus("state sync");
    }

    _ensureGraph(audioEl) {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      // createMediaElementSource may only be called once per element
      if (!this.source) {
        this.source = this.audioCtx.createMediaElementSource(audioEl);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
      }
    }

    async playWavAndLipSync(arrayBuffer, audioEl, mimeType) {
      this.setState("talking");
      const blob = new Blob([arrayBuffer], { type: mimeType || "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      audioEl.src = url;

      this._ensureGraph(audioEl);
      if (this.audioCtx.state === "suspended") await this.audioCtx.resume();

      const data = new Uint8Array(this.analyser.frequencyBinCount);
      const tick = () => {
        this.analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const mouth = Math.min(1, rms * 6);
        this.impl.setMouthOpen(mouth);
        this.raf = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(tick);

      await audioEl.play();
      await new Promise((resolve) => {
        audioEl.onended = resolve;
      });
      cancelAnimationFrame(this.raf);
      this.impl.setMouthOpen(0);
      URL.revokeObjectURL(url);
    }
  }

  global.KioskAvatar = { AvatarController, STATES };
})(window);
