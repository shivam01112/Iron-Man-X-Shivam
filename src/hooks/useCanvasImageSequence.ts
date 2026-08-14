"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScroll } from "framer-motion";

const PRELOAD_AHEAD = 28;
const PRELOAD_BEHIND = 8;
const MAX_CACHED_FRAMES = 48;
// 3 per section × 3 sections = 9 concurrent — HTTP/2-friendly
const PARALLEL_LOADS = 3;

type SequenceOptions = {
  frameCount: number;
  framePath: (frameNumber: number) => string;
  maxCanvasPixels: number;
  mobileScale?: number;
  onProgress: (progress: number, frameIndex: number) => void;
};

export function useCanvasImageSequence({
  frameCount,
  framePath,
  maxCanvasPixels,
  mobileScale = 1,
  onProgress,
}: SequenceOptions) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  // ImageBitmap: already GPU-decoded, drawImage is zero-cost on the main thread
  const framesRef = useRef<Array<ImageBitmap | undefined>>([]);
  const targetFrameRef = useRef(0);
  const lastDrawnFrameRef = useRef(-1);
  const progressRef = useRef(0);
  const nearbyRef = useRef(false);
  const activeRef = useRef(false);
  const loadedRef = useRef(false);
  // null = RAF loop not running; number = pending handle
  const rafRef = useRef<number | null>(null);
  // true while we're polling for the target frame to arrive
  const waitingForFrameRef = useRef(false);
  const directionRef = useRef(1);
  const ensureFramesRef = useRef<(index: number, direction: number) => void>(() => undefined);
  const startRafLoopRef = useRef<() => void>(() => undefined);
  const onProgressRef = useRef(onProgress);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  // ─── Draw ──────────────────────────────────────────────────────────────────
  // Returns true when the *exact* target frame was drawn.
  // Falls back to the nearest already-loaded frame so the canvas is never blank.
  const drawTargetFrame = useCallback((): boolean => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return false;

    const frames = framesRef.current;
    const target = targetFrameRef.current;

    let bitmap: ImageBitmap | undefined = frames[target];
    let drawn = target;

    if (!bitmap) {
      // Walk outward; prefer "behind" direction for visual continuity
      for (let dist = 1; dist < frameCount; dist++) {
        const behind = target - dist;
        const ahead = target + dist;
        if (behind >= 0 && frames[behind]) { bitmap = frames[behind]; drawn = behind; break; }
        if (ahead < frameCount && frames[ahead]) { bitmap = frames[ahead]; drawn = ahead; break; }
      }
    }

    if (!bitmap) return false;
    // Skip redundant draws (same frame already on canvas)
    if (drawn === lastDrawnFrameRef.current) return drawn === target;

    const canvasRatio = canvas.width / canvas.height;
    const bitmapRatio = bitmap.width / bitmap.height;
    let w: number, h: number;
    if (canvasRatio > bitmapRatio) {
      w = canvas.width;
      h = w / bitmapRatio;
    } else {
      h = canvas.height;
      w = h * bitmapRatio;
    }
    if (window.innerWidth <= 768) { w *= mobileScale; h *= mobileScale; }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    lastDrawnFrameRef.current = drawn;
    return drawn === target;
  }, [frameCount, mobileScale]);

  // ─── RAF render loop ───────────────────────────────────────────────────────
  // Single loop per section. Idles when exact frame is on canvas.
  // Keeps ticking (without scroll events) while waiting for a frame to decode.
  const startRafLoop = useCallback(() => {
    if (!activeRef.current || rafRef.current !== null) return;

    const tick = () => {
      rafRef.current = null;
      if (!activeRef.current) { waitingForFrameRef.current = false; return; }

      onProgressRef.current(progressRef.current, targetFrameRef.current);
      const exact = drawTargetFrame();

      if (!exact) {
        // Keep looping — target not ready yet, retry next vsync
        waitingForFrameRef.current = true;
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Done — go idle until scroll or a new frame arrives
        waitingForFrameRef.current = false;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [drawTargetFrame]);

  useEffect(() => { startRafLoopRef.current = startRafLoop; }, [startRafLoop]);

  // ─── Scroll → target frame ─────────────────────────────────────────────────
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    return scrollYProgress.on("change", (progress) => {
      const clamped = Math.min(1, Math.max(0, progress));
      const nextFrame = Math.min(frameCount - 1, Math.floor(clamped * frameCount));
      const prev = targetFrameRef.current;
      progressRef.current = clamped;
      targetFrameRef.current = nextFrame;
      if (nextFrame !== prev) directionRef.current = Math.sign(nextFrame - prev);
      if (nearbyRef.current) ensureFramesRef.current(nextFrame, directionRef.current);
      startRafLoopRef.current();
    });
  }, [frameCount, scrollYProgress]);

  // ─── Image loading: fetch + createImageBitmap (off-main-thread) ────────────
  useEffect(() => {
    let cancelled = false;
    let activeLoads = 0;
    let queue: number[] = [];
    let wantedFrames = new Set<number>();
    const frames = new Array<ImageBitmap | undefined>(frameCount);
    // 0=idle 1=loading 2=ready 3=error
    const states = new Array<0 | 1 | 2 | 3>(frameCount).fill(0);
    // AbortControllers keyed by frame index — only present while fetch is in-flight
    const controllers = new Map<number, AbortController>();
    framesRef.current = frames;

    // Free GPU memory for evicted frames
    const closeBitmap = (index: number) => {
      const bm = frames[index];
      if (bm) { try { bm.close(); } catch { /* already closed */ } }
      frames[index] = undefined;
    };

    const evictFrames = () => {
      const ready = states
        .map((s, i) => s === 2 ? i : -1)
        .filter((i) => i >= 0);
      if (ready.length <= MAX_CACHED_FRAMES) return;
      ready.sort((a, b) =>
        Math.abs(b - targetFrameRef.current) - Math.abs(a - targetFrameRef.current)
      );
      let toRemove = ready.length - MAX_CACHED_FRAMES;
      for (const i of ready) {
        if (toRemove <= 0) break;
        if (wantedFrames.has(i) || i === targetFrameRef.current || i === lastDrawnFrameRef.current) continue;
        closeBitmap(i);
        states[i] = 0;
        toRemove -= 1;
      }
    };

    const pumpQueue = () => {
      while (!cancelled && nearbyRef.current && activeLoads < PARALLEL_LOADS && queue.length) {
        const index = queue.shift();
        if (index === undefined || states[index] !== 0) continue;

        const controller = new AbortController();
        controllers.set(index, controller);
        activeLoads += 1;
        states[index] = 1;

        const url = framePath(index + 1);

        fetch(url, { signal: controller.signal } as RequestInit)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.blob();
          })
          .then((blob) =>
            createImageBitmap(blob, {
              premultiplyAlpha: "none",
              colorSpaceConversion: "none",
            })
          )
          .then((bitmap) => {
            // If this slot was aborted/evicted while we were decoding, discard
            if (!controllers.has(index) || cancelled) {
              try { bitmap.close(); } catch { /* ok */ }
              return;
            }
            controllers.delete(index);
            activeLoads -= 1;
            if (cancelled) { try { bitmap.close(); } catch { /* ok */ } return; }

            frames[index] = bitmap;
            states[index] = 2;

            if (!loadedRef.current) {
              loadedRef.current = true;
              setLoadProgress(1);
              setLoaded(true);
            }
            // Wake the render loop if it's waiting or this is the target
            if (waitingForFrameRef.current || index === targetFrameRef.current) {
              startRafLoopRef.current();
            }
            evictFrames();
            pumpQueue();
          })
          .catch((err: unknown) => {
            // AbortError means we intentionally cancelled — activeLoads already fixed
            if ((err as { name?: string }).name === "AbortError") return;
            // Slot cleaned up externally (e.g. stopAggressiveLoading raced us)
            if (!controllers.has(index)) return;
            controllers.delete(index);
            activeLoads -= 1;
            if (cancelled) return;
            states[index] = 3;
            pumpQueue();
          });
      }
    };

    // Abort & reset a single in-flight slot — adjusts activeLoads correctly
    const abortSlot = (index: number) => {
      const ctrl = controllers.get(index);
      if (!ctrl) return;
      ctrl.abort();
      controllers.delete(index);
      // Only reset state if the promise hasn't resolved yet (still "loading")
      if (states[index] === 1) {
        states[index] = 0;
        frames[index] = undefined;
        activeLoads = Math.max(0, activeLoads - 1);
      }
    };

    const stopAggressiveLoading = () => {
      // Abort all in-flight requests to save bandwidth when section leaves viewport
      for (const index of [...controllers.keys()]) abortSlot(index);
      queue = [];
      wantedFrames.clear();
    };

    const ensureFrames = (index: number, direction: number) => {
      if (cancelled || !nearbyRef.current) return;
      const dir = direction < 0 ? -1 : 1;
      const desired = [index];
      for (let d = 1; d <= PRELOAD_AHEAD; d++) {
        const fwd = index + d * dir;
        const bck = index - d * dir;
        if (fwd >= 0 && fwd < frameCount) desired.push(fwd);
        if (d <= PRELOAD_BEHIND && bck >= 0 && bck < frameCount) desired.push(bck);
      }
      wantedFrames = new Set(desired);
      // Replace pending queue — in-flight requests are allowed to finish
      queue = desired.filter((f) => states[f] === 0);
      evictFrames();
      pumpQueue();
    };
    ensureFramesRef.current = ensureFrames;

    const section = sectionRef.current;
    const nearbyObserver = new IntersectionObserver(
      ([entry]) => {
        nearbyRef.current = entry.isIntersecting;
        if (entry.isIntersecting) ensureFrames(targetFrameRef.current, directionRef.current);
        else stopAggressiveLoading();
      },
      { rootMargin: "120% 0px 100% 0px" },
    );
    const activeObserver = new IntersectionObserver(([entry]) => {
      activeRef.current = entry.isIntersecting;
      if (entry.isIntersecting) {
        ensureFrames(targetFrameRef.current, directionRef.current);
        startRafLoopRef.current();
      } else {
        if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        waitingForFrameRef.current = false;
      }
    });
    if (section) { nearbyObserver.observe(section); activeObserver.observe(section); }

    return () => {
      cancelled = true;
      nearbyObserver.disconnect();
      activeObserver.disconnect();
      // Abort every in-flight fetch
      for (const ctrl of controllers.values()) ctrl.abort();
      controllers.clear();
      queue = [];
      wantedFrames.clear();
      ensureFramesRef.current = () => undefined;
      // Return GPU memory from all loaded bitmaps
      for (let i = 0; i < frames.length; i++) closeBitmap(i);
    };
  }, [frameCount, framePath]);

  // ─── Canvas sizing ─────────────────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    // Cap DPR 1.25–1.5: retina sharpness without excess pixel budget
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = Math.round(bounds.width * dpr);
    let h = Math.round(bounds.height * dpr);
    const px = w * h;
    if (px > maxCanvasPixels) {
      const s = Math.sqrt(maxCanvasPixels / px);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    // Eagerly acquire context — never touches getContext() during scroll RAF
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "medium";
      contextRef.current = ctx;
    }
    lastDrawnFrameRef.current = -1; // force redraw at new resolution
    startRafLoopRef.current();
  }, [maxCanvasPixels]);

  useEffect(() => {
    resizeCanvas();
    const canvas = canvasRef.current;
    const ro = new ResizeObserver(resizeCanvas);
    if (canvas) ro.observe(canvas);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [resizeCanvas]);

  return { sectionRef, canvasRef, loadProgress, loaded };
}