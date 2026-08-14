"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScroll } from "framer-motion";

const PRELOAD_AHEAD = 28;
const PRELOAD_BEHIND = 8;
const MAX_CACHED_FRAMES = 48;
// Reduced from 5 → 3 to avoid saturating HTTP/2 across 3 concurrent sections.
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
  const framesRef = useRef<Array<HTMLImageElement | undefined>>([]);
  const targetFrameRef = useRef(0);
  const lastDrawnFrameRef = useRef(-1);
  const progressRef = useRef(0);
  const nearbyRef = useRef(false);
  const activeRef = useRef(false);
  const loadedRef = useRef(false);
  // rafRef: null = loop not running, number = pending RAF handle
  const rafRef = useRef<number | null>(null);
  // True while we're waiting for the target frame to load so the loop keeps ticking
  const waitingForFrameRef = useRef(false);
  const directionRef = useRef(1);
  const ensureFramesRef = useRef<(index: number, direction: number) => void>(() => undefined);
  const onProgressRef = useRef(onProgress);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  // ─── Draw ──────────────────────────────────────────────────────────────────
  // Returns true if the exact target frame was drawn, false if we fell back to
  // a nearby frame (or nothing was drawable yet).
  const drawTargetFrame = useCallback((): boolean => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return false;

    const frames = framesRef.current;
    const target = targetFrameRef.current;

    // Find the best available frame: exact target first, then nearest loaded
    let image: HTMLImageElement | undefined = frames[target];
    let drawn = target;

    if (!image || !image.complete || !image.naturalWidth) {
      // Walk outward from target looking for any ready frame
      image = undefined;
      for (let dist = 1; dist < frameCount; dist++) {
        // Prefer the frame just behind (already drawn side) for continuity
        const behind = target - dist;
        const ahead = target + dist;
        if (behind >= 0) {
          const f = frames[behind];
          if (f && f.complete && f.naturalWidth) { image = f; drawn = behind; break; }
        }
        if (ahead < frameCount) {
          const f = frames[ahead];
          if (f && f.complete && f.naturalWidth) { image = f; drawn = ahead; break; }
        }
      }
    }

    if (!image) return false;

    // Skip redundant draws
    if (drawn === lastDrawnFrameRef.current) return drawn === target;

    const canvasRatio = canvas.width / canvas.height;
    const imageRatio = image.naturalWidth / image.naturalHeight;
    let width: number;
    let height: number;
    if (canvasRatio > imageRatio) {
      width = canvas.width;
      height = width / imageRatio;
    } else {
      height = canvas.height;
      width = height * imageRatio;
    }
    if (window.innerWidth <= 768) {
      width *= mobileScale;
      height *= mobileScale;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );
    lastDrawnFrameRef.current = drawn;
    return drawn === target;
  }, [frameCount, mobileScale]);

  // ─── RAF render loop ───────────────────────────────────────────────────────
  // A single persistent loop per section. Starts when section is active,
  // runs until the exact target frame is drawn, then idles.
  // If the target frame isn't loaded yet it keeps ticking (retrying each RAF)
  // so there's never a frozen frame waiting for a scroll event.
  const startRafLoopRef = useRef<() => void>(() => undefined);

  const startRafLoop = useCallback(() => {
    if (!activeRef.current) return;
    if (rafRef.current !== null) return; // already running

    const tick = () => {
      rafRef.current = null;
      if (!activeRef.current) {
        waitingForFrameRef.current = false;
        return;
      }

      onProgressRef.current(progressRef.current, targetFrameRef.current);
      const exact = drawTargetFrame();

      if (!exact) {
        // Target frame not ready — keep the loop alive so we retry next tick
        waitingForFrameRef.current = true;
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Exact frame drawn — go idle until next scroll event
        waitingForFrameRef.current = false;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [drawTargetFrame]);

  useEffect(() => {
    startRafLoopRef.current = startRafLoop;
  }, [startRafLoop]);

  // ─── Scroll → target frame ─────────────────────────────────────────────────
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    return scrollYProgress.on("change", (progress) => {
      const clampedProgress = Math.min(1, Math.max(0, progress));
      const nextFrame = Math.min(
        frameCount - 1,
        Math.floor(clampedProgress * frameCount),
      );
      const previousFrame = targetFrameRef.current;
      progressRef.current = clampedProgress;
      targetFrameRef.current = nextFrame;
      if (nextFrame !== previousFrame) {
        directionRef.current = Math.sign(nextFrame - previousFrame);
      }
      if (nearbyRef.current) {
        ensureFramesRef.current(nextFrame, directionRef.current);
      }
      // Always kick the loop. If it's already running it won't double-start.
      startRafLoopRef.current();
    });
  }, [frameCount, scrollYProgress]);

  // ─── Image loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let activeLoads = 0;
    let queue: number[] = [];
    let wantedFrames = new Set<number>();
    const frames = new Array<HTMLImageElement | undefined>(frameCount);
    const states = new Array<0 | 1 | 2 | 3>(frameCount).fill(0);
    const activeImages = new Map<number, HTMLImageElement>();
    framesRef.current = frames;

    const evictFrames = () => {
      const readyFrames = states
        .map((state, index) => state === 2 ? index : -1)
        .filter((index) => index >= 0);
      if (readyFrames.length <= MAX_CACHED_FRAMES) return;
      readyFrames.sort(
        (a, b) => Math.abs(b - targetFrameRef.current) - Math.abs(a - targetFrameRef.current),
      );
      let removeCount = readyFrames.length - MAX_CACHED_FRAMES;
      for (const index of readyFrames) {
        if (removeCount <= 0) break;
        if (
          wantedFrames.has(index) ||
          index === targetFrameRef.current ||
          index === lastDrawnFrameRef.current
        ) continue;
        const image = frames[index];
        if (image) {
          image.onload = null;
          image.onerror = null;
          image.src = "";
        }
        frames[index] = undefined;
        states[index] = 0;
        removeCount -= 1;
      }
    };

    const pumpQueue = () => {
      while (!cancelled && nearbyRef.current && activeLoads < PARALLEL_LOADS && queue.length) {
        const index = queue.shift();
        if (index === undefined || states[index] !== 0) continue;
        const image = new Image();
        activeLoads += 1;
        states[index] = 1;
        frames[index] = image;
        activeImages.set(index, image);
        image.decoding = "async";
        image.fetchPriority = index === targetFrameRef.current ? "high" : "auto";
        image.onload = async () => {
          try {
            await image.decode();
          } catch {
            // drawImage can still use an image after decode() rejects in browsers
            // that do not fully support explicit async decoding.
          }
          if (activeImages.get(index) !== image) return;
          activeImages.delete(index);
          activeLoads -= 1;
          if (cancelled) return;
          states[index] = 2;
          if (!loadedRef.current) {
            loadedRef.current = true;
            setLoadProgress(1);
            setLoaded(true);
          }
          // If the loop is already waiting for a frame, it will pick this up
          // on its next tick. If it has gone idle, restart it now so we
          // immediately render the newly-arrived frame.
          if (waitingForFrameRef.current || index === targetFrameRef.current) {
            startRafLoopRef.current();
          }
          evictFrames();
          pumpQueue();
        };
        image.onerror = () => {
          if (activeImages.get(index) !== image) return;
          activeImages.delete(index);
          activeLoads -= 1;
          if (cancelled) return;
          states[index] = 3;
          frames[index] = undefined;
          pumpQueue();
        };
        image.src = framePath(index + 1);
      }
    };

    const stopAggressiveLoading = () => {
      queue = [];
      wantedFrames.clear();
    };

    const ensureFrames = (index: number, direction: number) => {
      if (cancelled || !nearbyRef.current) return;
      const travelDirection = direction < 0 ? -1 : 1;
      const desired = [index];
      for (let distance = 1; distance <= PRELOAD_AHEAD; distance += 1) {
        const ahead = index + distance * travelDirection;
        if (ahead >= 0 && ahead < frameCount) desired.push(ahead);
        if (distance <= PRELOAD_BEHIND) {
          const behind = index - distance * travelDirection;
          if (behind >= 0 && behind < frameCount) desired.push(behind);
        }
      }
      wantedFrames = new Set(desired);

      // Replace, rather than append to, pending work. Already-started requests are
      // allowed to finish so rapid target changes never restart the same download.
      queue = desired.filter((frame) => states[frame] === 0);
      evictFrames();
      pumpQueue();
    };
    ensureFramesRef.current = ensureFrames;

    const section = sectionRef.current;
    const nearbyObserver = new IntersectionObserver(
      ([entry]) => {
        nearbyRef.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          ensureFrames(targetFrameRef.current, directionRef.current);
        } else {
          stopAggressiveLoading();
        }
      },
      { rootMargin: "120% 0px 100% 0px" },
    );
    const activeObserver = new IntersectionObserver(([entry]) => {
      activeRef.current = entry.isIntersecting;
      if (entry.isIntersecting) {
        ensureFrames(targetFrameRef.current, directionRef.current);
        startRafLoopRef.current();
      } else {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        waitingForFrameRef.current = false;
      }
    });
    if (section) {
      nearbyObserver.observe(section);
      activeObserver.observe(section);
    }

    return () => {
      cancelled = true;
      nearbyObserver.disconnect();
      activeObserver.disconnect();
      stopAggressiveLoading();
      ensureFramesRef.current = () => undefined;
      for (const image of frames) {
        if (!image) continue;
        image.onload = null;
        image.onerror = null;
        image.src = "";
      }
    };
  }, [frameCount, framePath]);

  // ─── Canvas sizing ─────────────────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    // Cap DPR at 1.25–1.5 to avoid massive canvas pixel counts on hi-DPI screens
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = Math.round(bounds.width * dpr);
    let height = Math.round(bounds.height * dpr);
    const pixelCount = width * height;
    if (pixelCount > maxCanvasPixels) {
      const scale = Math.sqrt(maxCanvasPixels / pixelCount);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    // Eagerly (re-)acquire the context so drawTargetFrame's hot path never
    // has to call getContext() during a scroll RAF tick.
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "medium";
      contextRef.current = ctx;
    }
    // Redraw current frame at new resolution
    lastDrawnFrameRef.current = -1;
    startRafLoopRef.current();
  }, [maxCanvasPixels]);

  useEffect(() => {
    resizeCanvas();
    const canvas = canvasRef.current;
    const resizeObserver = new ResizeObserver(resizeCanvas);
    if (canvas) resizeObserver.observe(canvas);
    return () => {
      resizeObserver.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [resizeCanvas]);

  return { sectionRef, canvasRef, loadProgress, loaded };
}
