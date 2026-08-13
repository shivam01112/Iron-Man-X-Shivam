"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScroll } from "framer-motion";

const PRELOAD_AHEAD = 28;
const PRELOAD_BEHIND = 8;
const MAX_CACHED_FRAMES = 48;
const PARALLEL_LOADS = 5;

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
  const rafRef = useRef<number | null>(null);
  const directionRef = useRef(1);
  const ensureFramesRef = useRef<(index: number, direction: number) => void>(() => undefined);
  const scheduleRenderRef = useRef<() => void>(() => undefined);
  const onProgressRef = useRef(onProgress);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const drawTargetFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const image = framesRef.current[targetFrameRef.current];
    if (!canvas || !image || !image.complete || !image.naturalWidth) return;

    const context = contextRef.current ?? canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });
    if (!context) return;
    contextRef.current = context;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "medium";

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
    lastDrawnFrameRef.current = targetFrameRef.current;
  }, [mobileScale]);

  const scheduleRender = useCallback(() => {
    if (!activeRef.current || rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!activeRef.current) return;
      onProgressRef.current(progressRef.current, targetFrameRef.current);
      drawTargetFrame();
    });
  }, [drawTargetFrame]);

  useEffect(() => {
    scheduleRenderRef.current = scheduleRender;
  }, [scheduleRender]);

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
      scheduleRenderRef.current();
    });
  }, [frameCount, scrollYProgress]);

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
          if (index === targetFrameRef.current) scheduleRenderRef.current();
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
        scheduleRenderRef.current();
      } else if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
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

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
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
    scheduleRenderRef.current();
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
