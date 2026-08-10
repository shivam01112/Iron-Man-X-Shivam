"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { HudFrame } from "@/components/ui/HudFrame";
import {
  SPIDER_BEATS,
  SPIDER_FRAME_COUNT,
  spiderFramePath,
} from "@/lib/spiderman";

const PARALLEL_FRAME_LOADS = 4;
const INITIAL_LOOK_AHEAD = 8;
const MAX_LOOK_AHEAD = 12;
const LOOK_BEHIND = 4;
const CACHE_BUFFER = 4;
const CANCEL_LOADS_AFTER_JUMP = 8;
const NEAREST_FRAME_SEARCH = 16;
const MAX_CANVAS_PIXELS = 1280 * 720;
const SCROLL_PIXELS_PER_FRAME = 9;
const FRAME_STEP = 1;
const ANCHOR_INTERVAL = 5;
const BITMAP_WIDTH = 960;
const BITMAP_HEIGHT = 540;
const ANCHOR_FRAMES = Array.from(
  { length: Math.ceil(SPIDER_FRAME_COUNT / ANCHOR_INTERVAL) },
  (_, index) => Math.min(index * ANCHOR_INTERVAL, SPIDER_FRAME_COUNT - 1),
);

type SpiderFrame = HTMLImageElement | ImageBitmap;

const isImageBitmap = (frame: SpiderFrame | undefined): frame is ImageBitmap =>
  typeof ImageBitmap !== "undefined" && frame instanceof ImageBitmap;

export function SpiderManReveal() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const introRef = useRef<HTMLDivElement | null>(null);
  const outroRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const sequenceRef = useRef<HTMLSpanElement | null>(null);
  const framesRef = useRef<Array<SpiderFrame | undefined>>([]);
  const frameReadyRef = useRef<boolean[]>([]);
  const renderFrameRef = useRef<() => void>(() => undefined);
  const ensureFramesRef = useRef<(index: number, direction: number) => void>(() => undefined);
  const loadingStartedRef = useRef(false);
  const loadedRef = useRef(false);
  const scrollTickingRef = useRef(false);
  const renderTickingRef = useRef(false);
  const lastFrameRef = useRef(-1);
  const lastImageRef = useRef<SpiderFrame | null>(null);
  const targetFrameRef = useRef(0);
  const previousBeatsRef = useRef("");

  const [loadProgress, setLoadProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [visibleBeats, setVisibleBeats] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let activeLoads = 0;
    let queue: number[] = [];
    const settledAnchors = new Set<number>();
    let protectedFrames = new Set<number>();
    let lastRequestedFrame = 0;
    const images = new Array<SpiderFrame | undefined>(SPIDER_FRAME_COUNT);
    const activeImages = new Map<number, HTMLImageElement>();
    const frameState = new Array<0 | 1 | 2 | 3>(SPIDER_FRAME_COUNT).fill(0);
    frameReadyRef.current = new Array<boolean>(SPIDER_FRAME_COUNT).fill(false);
    framesRef.current = images;

    const evictDistantFrames = (cacheSize: number) => {
      const readyFrames = frameState
        .map((state, index) => state === 2 ? index : -1)
        .filter((index) => index >= 0);
      if (readyFrames.length <= cacheSize) return;

      readyFrames.sort(
        (a, b) => Math.abs(b - targetFrameRef.current) - Math.abs(a - targetFrameRef.current),
      );
      let removeCount = readyFrames.length - cacheSize;
      for (const index of readyFrames) {
        if (removeCount <= 0) break;
        if (protectedFrames.has(index) || ANCHOR_FRAMES.includes(index)) continue;
        const drawable = images[index];
        if (isImageBitmap(drawable)) {
          drawable.close();
        } else if (drawable instanceof HTMLImageElement) {
          drawable.onload = null;
          drawable.onerror = null;
          drawable.src = "";
        }
        images[index] = undefined;
        frameState[index] = 0;
        frameReadyRef.current[index] = false;
        removeCount -= 1;
      }
    };

    const pumpQueue = () => {
      while (!cancelled && activeLoads < PARALLEL_FRAME_LOADS && queue.length > 0) {
        const index = queue.shift();
        if (index === undefined || frameState[index] !== 0) continue;

        const image = new Image();
        activeLoads += 1;
        frameState[index] = 1;
        image.decoding = "async";
        image.fetchPriority = Math.abs(index - targetFrameRef.current) <= 1 ? "high" : "auto";
        images[index] = image;
        activeImages.set(index, image);

        image.onload = async () => {
          if (activeImages.get(index) !== image) return;
          let drawable: SpiderFrame = image;
          try {
            if (typeof createImageBitmap === "function") drawable = await createImageBitmap(image, {
              resizeWidth: BITMAP_WIDTH,
              resizeHeight: BITMAP_HEIGHT,
              resizeQuality: "medium",
            });
          } catch {
            // Keep the image fallback for browsers without ImageBitmap support.
          }
          if (activeImages.get(index) !== image) {
            if (isImageBitmap(drawable)) drawable.close();
            return;
          }
          activeImages.delete(index);
          activeLoads -= 1;
          if (cancelled) return;
          images[index] = drawable;
          if (drawable !== image) {
            image.onload = null;
            image.onerror = null;
            image.src = "";
          }
          frameState[index] = 2;
          frameReadyRef.current[index] = true;

          if (!loadedRef.current && ANCHOR_FRAMES.includes(index)) {
            settledAnchors.add(index);
            setLoadProgress(settledAnchors.size / ANCHOR_FRAMES.length);
            if (frameState[0] === 2 && settledAnchors.size >= ANCHOR_FRAMES.length) {
              loadedRef.current = true;
              setLoaded(true);
            }
          }

          if (Math.abs(index - targetFrameRef.current) <= NEAREST_FRAME_SEARCH) {
            renderFrameRef.current();
          }
          evictDistantFrames(protectedFrames.size + CACHE_BUFFER);
          pumpQueue();
        };
        image.onerror = () => {
          if (activeImages.get(index) !== image) return;
          activeImages.delete(index);
          activeLoads -= 1;
          if (cancelled) return;
          frameState[index] = 3;
          if (!loadedRef.current && ANCHOR_FRAMES.includes(index)) {
            settledAnchors.add(index);
            setLoadProgress(settledAnchors.size / ANCHOR_FRAMES.length);
            if (frameState[0] === 2 && settledAnchors.size >= ANCHOR_FRAMES.length) {
              loadedRef.current = true;
              setLoaded(true);
            }
          }
          pumpQueue();
        };
        image.src = spiderFramePath(index + 1);
      }
    };

    const ensureFrames = (index: number, direction: number) => {
      if (cancelled) return;
      const travelDirection = direction < 0 ? -1 : 1;
      const distanceMoved = Math.abs(index - lastRequestedFrame);
      const lookAhead = Math.min(MAX_LOOK_AHEAD, INITIAL_LOOK_AHEAD + distanceMoved * 2);
      lastRequestedFrame = index;
      const desired: number[] = [index];

      for (let distance = 1; distance <= lookAhead; distance += 1) {
        const frame = index + distance * FRAME_STEP * travelDirection;
        if (frame >= 0 && frame < SPIDER_FRAME_COUNT) desired.push(frame);
        if (distance <= LOOK_BEHIND) {
          const trailingFrame = index - distance * FRAME_STEP * travelDirection;
          if (trailingFrame >= 0 && trailingFrame < SPIDER_FRAME_COUNT) {
            desired.push(trailingFrame);
          }
        }
      }

      protectedFrames = new Set([...ANCHOR_FRAMES, ...desired]);
      if (lastFrameRef.current >= 0) protectedFrames.add(lastFrameRef.current);

      // Old in-flight requests used to occupy every connection after a fast
      // scroll jump. Cancel them so the newly requested frame starts now.
      if (distanceMoved > CANCEL_LOADS_AFTER_JUMP) {
        const prioritizedActiveLoads = [...activeImages].sort(
          ([a], [b]) => Math.abs(a - index) - Math.abs(b - index),
        );
        let retainedNearbyLoads = 0;
        for (const [activeIndex, image] of prioritizedActiveLoads) {
          if (protectedFrames.has(activeIndex)) continue;
          if (
            retainedNearbyLoads < 2 &&
            Math.abs(activeIndex - index) <= NEAREST_FRAME_SEARCH
          ) {
            retainedNearbyLoads += 1;
            continue;
          }
          activeImages.delete(activeIndex);
          image.onload = null;
          image.onerror = null;
          image.src = "";
          images[activeIndex] = undefined;
          frameState[activeIndex] = 0;
          activeLoads -= 1;
        }
      }

      queue = [...desired, ...ANCHOR_FRAMES].filter(
        (frame, position, frames) =>
          frames.indexOf(frame) === position && frameState[frame] === 0,
      );
      pumpQueue();
      evictDistantFrames(desired.length + CACHE_BUFFER);
    };
    ensureFramesRef.current = ensureFrames;

    const startLoading = () => {
      if (loadingStartedRef.current || cancelled) return;
      loadingStartedRef.current = true;
      protectedFrames = new Set(ANCHOR_FRAMES);
      queue = ANCHOR_FRAMES.filter((frame) => frameState[frame] === 0);
      pumpQueue();
    };

    const section = sectionRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) startLoading();
      },
      { rootMargin: "100% 0px" },
    );
    if (section) observer.observe(section);

    return () => {
      cancelled = true;
      ensureFramesRef.current = () => undefined;
      loadingStartedRef.current = false;
      observer.disconnect();
      for (const drawable of images) {
        if (isImageBitmap(drawable)) {
          drawable.close();
        } else if (drawable instanceof HTMLImageElement) {
          drawable.onload = null;
          drawable.onerror = null;
          drawable.src = "";
        }
      }
    };
  }, []);

  const drawImage = useCallback((image: SpiderFrame) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = contextRef.current ?? canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });
    if (!context) return;
    contextRef.current = context;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "medium";

    const sourceWidth = image instanceof HTMLImageElement
      ? image.naturalWidth
      : image.width;
    const sourceHeight = image instanceof HTMLImageElement
      ? image.naturalHeight
      : image.height;
    const imageRatio = sourceWidth / sourceHeight;
    const canvasRatio = canvas.width / canvas.height;
    let width: number;
    let height: number;

    if (canvasRatio > imageRatio) {
      width = canvas.width;
      height = width / imageRatio;
    } else {
      height = canvas.height;
      width = height * imageRatio;
    }

    context.drawImage(
      image,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );
  }, []);

  const renderFrame = useCallback(() => {
    if (renderTickingRef.current) return;
    renderTickingRef.current = true;

    requestAnimationFrame(() => {
      renderTickingRef.current = false;
      const target = targetFrameRef.current;
      let drawableFrame = target;
      if (!frameReadyRef.current[drawableFrame]) {
        for (let distance = 1; distance <= NEAREST_FRAME_SEARCH; distance += 1) {
          const before = target - distance;
          const after = target + distance;
          if (before >= 0 && frameReadyRef.current[before]) {
            drawableFrame = before;
            break;
          }
          if (after < SPIDER_FRAME_COUNT && frameReadyRef.current[after]) {
            drawableFrame = after;
            break;
          }
        }
      }
      const image = frameReadyRef.current[drawableFrame]
        ? framesRef.current[drawableFrame]
        : lastImageRef.current;
      if (!image) return;

      drawImage(image);
      if (
        frameReadyRef.current[drawableFrame] &&
        image === framesRef.current[drawableFrame]
      ) {
        lastFrameRef.current = drawableFrame;
      }
      lastImageRef.current = image;
    });
  }, [drawImage]);

  useEffect(() => {
    renderFrameRef.current = renderFrame;
  }, [renderFrame]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let renderWidth = Math.round(window.innerWidth * dpr);
    let renderHeight = Math.round(window.innerHeight * dpr);
    const pixelCount = renderWidth * renderHeight;
    if (pixelCount > MAX_CANVAS_PIXELS) {
      const scale = Math.sqrt(MAX_CANVAS_PIXELS / pixelCount);
      renderWidth = Math.round(renderWidth * scale);
      renderHeight = Math.round(renderHeight * scale);
    }
    canvas.width = renderWidth;
    canvas.height = renderHeight;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    renderFrame();
  }, [renderFrame]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    if (!loaded) return;
    renderFrame();
  }, [renderFrame, loaded]);

  useEffect(() => {
    const onScroll = () => {
      if (scrollTickingRef.current) return;
      scrollTickingRef.current = true;

      requestAnimationFrame(() => {
        scrollTickingRef.current = false;
        const section = sectionRef.current;
        if (!section) return;

        const rect = section.getBoundingClientRect();
        if (rect.top > window.innerHeight || rect.bottom < 0) return;
        const scrollable = section.offsetHeight - window.innerHeight;
        const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
        const rawFrame = Math.min(
          SPIDER_FRAME_COUNT - 1,
          Math.floor(progress * SPIDER_FRAME_COUNT),
        );
        const frame = Math.min(
          SPIDER_FRAME_COUNT - 1,
          Math.round(rawFrame / FRAME_STEP) * FRAME_STEP,
        );

        const previousFrame = targetFrameRef.current;
        const direction = Math.sign(frame - previousFrame);
        targetFrameRef.current = frame;
        if (!loadingStartedRef.current) return;
        ensureFramesRef.current(frame, direction);
        if (!loadedRef.current) return;
        if (frame !== lastFrameRef.current) {
          renderFrame();
        }

        if (introRef.current) {
          const opacity = Math.max(0, 1 - progress / 0.14);
          introRef.current.style.opacity = String(opacity);
          introRef.current.style.transform = `translateY(${(1 - opacity) * 14}px)`;
        }
        if (outroRef.current) {
          const opacity = Math.min(1, Math.max(0, (progress - 0.86) / 0.06));
          outroRef.current.style.opacity = String(opacity);
          outroRef.current.style.transform = `translateY(${(1 - opacity) * 14}px)`;
        }
        if (progressRef.current) {
          progressRef.current.style.transform = `scaleX(${progress})`;
        }
        if (sequenceRef.current) {
          sequenceRef.current.textContent = `SEQ ${String(frame + 1).padStart(3, "0")} / ${SPIDER_FRAME_COUNT}`;
        }

        const nextVisible = new Set<string>();
        for (const beat of SPIDER_BEATS) {
          if (progress >= beat.show && progress <= beat.hide) {
            nextVisible.add(beat.id);
          }
        }
        const ids = [...nextVisible].sort().join(",");
        if (ids !== previousBeatsRef.current) {
          previousBeatsRef.current = ids;
          setVisibleBeats(nextVisible);
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [renderFrame]);

  return (
    <section
      ref={sectionRef}
      id="spiderman"
      className="spiderman-section scroll-animation relative border-t border-white/5 bg-background"
      style={{
        height: `calc(100vh + ${SPIDER_FRAME_COUNT * SCROLL_PIXELS_PER_FRAME}px)`,
      }}
    >
      <div
        className="sticky top-0 min-h-[100dvh] w-full overflow-hidden bg-background"
        style={{ height: "100dvh", willChange: "transform", transform: "translateZ(0)" }}
      >
        <canvas
          ref={canvasRef}
          aria-label="Animated Spider-Man cinematic sequence"
          role="img"
          className="absolute inset-0 h-full w-full"
          style={{ transform: "translateZ(0)" }}
        />

        <div className="spider-vignette pointer-events-none absolute inset-0" />

        <div className="pointer-events-none absolute left-6 top-24 text-accent md:left-10 md:top-28">
          <HudFrame corner="tl" size={26} />
        </div>
        <div className="pointer-events-none absolute right-6 top-24 text-accent md:right-10 md:top-28">
          <HudFrame corner="tr" size={26} />
        </div>
        <div className="pointer-events-none absolute bottom-14 left-6 text-accent md:bottom-16 md:left-10">
          <HudFrame corner="bl" size={26} />
        </div>
        <div className="pointer-events-none absolute bottom-14 right-6 text-accent md:bottom-16 md:right-10">
          <HudFrame corner="br" size={26} />
        </div>

        <div className="pointer-events-none absolute left-6 top-20 z-10 flex items-center gap-2 md:left-10 md:top-24">
          <div className="h-px w-8 bg-accent/60" />
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-400">
            Web Protocol — Active
          </span>
        </div>
        <div className="pointer-events-none absolute right-6 top-20 z-10 flex items-center gap-3 md:right-10 md:top-24">
          <span ref={sequenceRef} className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
            SEQ 001 / {SPIDER_FRAME_COUNT}
          </span>
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_12px_currentColor]" />
        </div>

        <div
          ref={introRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-start gap-5 px-6 pb-24 md:px-12 md:pb-28"
          style={{ transition: "opacity 80ms linear" }}
        >
          <EyebrowBadge>SPIDER SENSE // SHIVAM // ONLINE</EyebrowBadge>
          <h2 className="max-w-[13ch] font-sans text-5xl font-semibold leading-[0.92] tracking-tighter text-foreground md:text-7xl lg:text-8xl">
            SpiderMan
            <br />
            <span className="text-accent">X Shivam</span>
          </h2>
          <p className="max-w-[44ch] font-sans text-sm leading-relaxed text-zinc-300 md:text-base">
            Courage in motion. A cinematic Spider-Man experience powered by Shivam&apos;s imagination.
          </p>
        </div>

        {SPIDER_BEATS.map((beat, index) => {
          const visible = visibleBeats.has(beat.id);
          const position = index === 0
            ? "top-[22%] right-6 md:right-12"
            : index === 1
              ? "top-1/2 -translate-y-1/2 left-6 md:left-12"
              : "bottom-24 right-6 md:bottom-28 md:right-12";
          return (
            <div key={beat.id} className={`pointer-events-none absolute ${position} z-20 hidden w-[420px] max-w-[90vw] md:block`}>
              <figure className={`card-surface pointer-events-auto p-6 transition-all duration-400 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"}`}>
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{beat.label}</span>
                <blockquote className="mt-3 font-sans text-xl font-medium leading-snug tracking-tight text-foreground">
                  &ldquo;{beat.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400">
                  <span>Shivam</span>
                  <span className="text-accent">Spider Verse</span>
                </figcaption>
              </figure>
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-x-0 top-[36%] z-20 flex flex-col gap-3 px-6 md:hidden">
          {SPIDER_BEATS.map((beat) => {
            const visible = visibleBeats.has(beat.id);
            return (
              <figure key={beat.id} className={`card-surface p-5 transition-all duration-400 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
                <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-accent">{beat.label}</span>
                <blockquote className="mt-2 font-sans text-base font-medium leading-snug text-foreground">&ldquo;{beat.quote}&rdquo;</blockquote>
              </figure>
            );
          })}
        </div>

        <div
          ref={outroRef}
          className="pointer-events-none absolute bottom-24 left-6 z-10 flex flex-col items-start gap-4 md:bottom-32 md:left-12"
          style={{ opacity: 0, transition: "opacity 80ms linear" }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Mission — complete</span>
          <span className="rounded-full border border-white/15 bg-black/30 px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-foreground backdrop-blur-md">
            SpiderMan X Shivam
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
          <div className="mx-6 mb-3 h-px bg-white/10 md:mx-10">
            <div ref={progressRef} className="h-full origin-left bg-accent" style={{ transform: "scaleX(0)", transition: "transform 80ms linear" }} />
          </div>
          <div className="mx-6 flex items-center justify-between pb-4 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500 md:mx-10">
            <span>SPIDER-MAN // ACTIVE</span>
            <span>SHIVAM // CREATOR</span>
            <span>Scroll ↓</span>
          </div>
        </div>

        {!loaded && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-background px-6">
            <EyebrowBadge>WEB SHOOTER // CALIBRATING</EyebrowBadge>
            <div className="h-px w-60 bg-white/10 md:w-80">
              <div className="h-full bg-accent transition-[width] duration-150 ease-out" style={{ width: `${Math.round(loadProgress * 100)}%` }} />
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-zinc-500">
              Loading Spider Verse &nbsp;·&nbsp; {Math.round(loadProgress * 100)}%
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
