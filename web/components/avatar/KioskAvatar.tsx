"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
} from "react";
import type { AvatarState } from "@/lib/types";

export type KioskAvatarHandle = {
  setState: (state: AvatarState) => void;
  playAndLipSync: (
    arrayBuffer: ArrayBuffer,
    audioEl: HTMLAudioElement,
    mimeType?: string,
  ) => Promise<void>;
};

const STATES: Record<string, AvatarState> = {
  idle: "idle",
  talking: "talking",
  listening: "listening",
};

function createCanvasAvatar(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  let visualState: AvatarState = "idle";
  let mouthOpen = 0;
  let listenPulse = 0;
  let raf = 0;

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx!.clearRect(0, 0, w, h);

    const g = ctx!.createRadialGradient(w * 0.5, h * 0.4, 20, w * 0.5, h * 0.5, w * 0.55);
    g.addColorStop(0, "#0a2840");
    g.addColorStop(1, "#020810");
    ctx!.fillStyle = g;
    ctx!.fillRect(0, 0, w, h);

    ctx!.fillStyle = "#c8dce8";
    ctx!.beginPath();
    ctx!.ellipse(w * 0.5, h * 0.48, w * 0.28, h * 0.34, 0, 0, Math.PI * 2);
    ctx!.fill();

    const eyeY = h * 0.42;
    const blink =
      visualState === "idle" && Math.sin(Date.now() / 400) > 0.97 ? 0.15 : 1;
    ctx!.fillStyle = "#0a1828";
    ctx!.beginPath();
    ctx!.ellipse(w * 0.38, eyeY, 10, 10 * blink, 0, 0, Math.PI * 2);
    ctx!.ellipse(w * 0.62, eyeY, 10, 10 * blink, 0, 0, Math.PI * 2);
    ctx!.fill();

    if (visualState === "listening") {
      listenPulse = (listenPulse + 0.04) % (Math.PI * 2);
      ctx!.strokeStyle = `rgba(0, 180, 255, ${0.35 + 0.25 * Math.sin(listenPulse)})`;
      ctx!.lineWidth = 3;
      ctx!.beginPath();
      ctx!.arc(w * 0.5, h * 0.48, w * 0.34 + 4 * Math.sin(listenPulse), 0, Math.PI * 2);
      ctx!.stroke();
    }

    const open = Math.max(0, Math.min(1, mouthOpen));
    const mouthW = 36 + open * 8;
    const mouthH = 4 + open * 28;
    ctx!.fillStyle = "#3a5068";
    ctx!.beginPath();
    ctx!.ellipse(w * 0.5, h * 0.62, mouthW * 0.5, mouthH * 0.5, 0, 0, Math.PI * 2);
    ctx!.fill();

    ctx!.fillStyle = "rgba(232, 244, 255, 0.85)";
    ctx!.font = "600 12px system-ui, sans-serif";
    ctx!.textAlign = "center";
    ctx!.fillText(String(visualState).toUpperCase(), w * 0.5, h * 0.92);

    raf = requestAnimationFrame(draw);
  }

  draw();

  return {
    setState(next: AvatarState) {
      visualState = STATES[next] || "idle";
      if (visualState !== "talking") {
        mouthOpen = visualState === "listening" ? 0.05 : 0;
      }
    },
    setMouthOpen(v: number) {
      mouthOpen = v;
    },
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}

type KioskAvatarProps = {
  size?: number;
  onStatusChange?: (status: string) => void;
};

export const KioskAvatar = forwardRef<KioskAvatarHandle, KioskAvatarProps>(
  function KioskAvatar({ size = 280, onStatusChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const implRef = useRef<ReturnType<typeof createCanvasAvatar> | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const lipSyncRafRef = useRef(0);
    const visualStateRef = useRef<AvatarState>("idle");

    const setStatus = useCallback(
      (msg: string) => {
        onStatusChange?.(`avatar: ${visualStateRef.current} — ${msg}`);
      },
      [onStatusChange],
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = size;
      canvas.height = size;
      implRef.current = createCanvasAvatar(canvas);
      setStatus("canvas avatar (AnalyserNode lip sync)");
      return () => implRef.current?.destroy();
    }, [size, setStatus]);

    const setState = useCallback(
      (state: AvatarState) => {
        visualStateRef.current = state;
        implRef.current?.setState(state);
        setStatus("state sync");
      },
      [setStatus],
    );

    const ensureGraph = useCallback((audioEl: HTMLAudioElement) => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        )();
      }
      if (!sourceRef.current) {
        sourceRef.current = audioCtxRef.current.createMediaElementSource(audioEl);
        analyserRef.current = audioCtxRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioCtxRef.current.destination);
      }
    }, []);

    const playAndLipSync = useCallback(
      async (
        arrayBuffer: ArrayBuffer,
        audioEl: HTMLAudioElement,
        mimeType = "audio/mpeg",
      ) => {
        setState("talking");
        const blob = new Blob([arrayBuffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        audioEl.src = url;

        ensureGraph(audioEl);
        if (audioCtxRef.current?.state === "suspended") {
          await audioCtxRef.current.resume();
        }

        const analyser = analyserRef.current!;
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          implRef.current?.setMouthOpen(Math.min(1, rms * 6));
          lipSyncRafRef.current = requestAnimationFrame(tick);
        };
        cancelAnimationFrame(lipSyncRafRef.current);
        lipSyncRafRef.current = requestAnimationFrame(tick);

        await audioEl.play();
        await new Promise<void>((resolve) => {
          audioEl.onended = () => resolve();
        });
        cancelAnimationFrame(lipSyncRafRef.current);
        implRef.current?.setMouthOpen(0);
        URL.revokeObjectURL(url);
      },
      [ensureGraph, setState],
    );

    useImperativeHandle(ref, () => ({ setState, playAndLipSync }), [
      setState,
      playAndLipSync,
    ]);

    return (
      <div
        className="grid aspect-square place-items-center overflow-hidden rounded-[var(--radius)] bg-black/25"
        style={{ maxWidth: size, maxHeight: size }}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
    );
  },
);
