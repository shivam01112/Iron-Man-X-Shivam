"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { HudFrame } from "@/components/ui/HudFrame";
import { DIALOGUES, FRAME_COUNT, HERO_TEXT_FADE_END, framePath } from "@/lib/hero";

const INITIAL_READY_FRAMES = 8;
const FRAME_LOOK_AHEAD = 12;
const FRAME_LOOK_BEHIND = 4;
const MAX_CACHED_FRAMES = 24;
const PARALLEL_LOADS = 3;
const FRAME_STEP = 2;
const MAX_CANVAS_PIXELS = 1280 * 720;

export function Hero() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const heroTextRef = useRef<HTMLDivElement | null>(null);
  const bigLeftTextRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const powerReadoutRef = useRef<HTMLSpanElement | null>(null);

  const framesRef = useRef<HTMLImageElement[]>([]);
  const frameReadyRef = useRef<boolean[]>([]);
  const drawFrameRef = useRef<(index: number) => void>(() => undefined);
  const tickingRef = useRef(false);
  const loadedRef = useRef(false);
  const lastFrameRef = useRef(-1);
  const targetFrameRef = useRef(0);
  const ensureFramesRef = useRef<(index: number, direction: number) => void>(() => undefined);
  const prevVisibleIdsRef = useRef("");

  const [loadProgress, setLoadProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [visibleCards, setVisibleCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let activeLoads = 0;
    let queue: number[] = [];
    let initialReadyCount = 0;
    const imgs = new Array<HTMLImageElement>(FRAME_COUNT);
    const frameState = new Array<0 | 1 | 2 | 3>(FRAME_COUNT).fill(0);
    frameReadyRef.current = new Array<boolean>(FRAME_COUNT).fill(false);
    framesRef.current = imgs;

    const evictDistantFrames = () => {
      const ready: number[] = [];
      for (let index = 0; index < FRAME_COUNT; index += 1) {
        if (frameState[index] === 2) ready.push(index);
      }
      if (ready.length <= MAX_CACHED_FRAMES) return;
      ready.sort(
        (a, b) =>
          Math.abs(b - targetFrameRef.current) - Math.abs(a - targetFrameRef.current),
      );
      for (let i = 0; i < ready.length - MAX_CACHED_FRAMES; i += 1) {
        const index = ready[i];
        if (index === lastFrameRef.current || index === targetFrameRef.current) continue;
        const image = imgs[index];
        if (image) {
          image.onload = null;
          image.onerror = null;
          image.src = "";
        }
        frameState[index] = 0;
        frameReadyRef.current[index] = false;
      }
    };

    const pumpQueue = () => {
      while (!cancelled && activeLoads < PARALLEL_LOADS && queue.length > 0) {
        const index = queue.shift();
        if (index === undefined || frameState[index] !== 0) continue;
        const img = new Image();
        activeLoads += 1;
        frameState[index] = 1;
        img.decoding = "async";
        img.fetchPriority = index < 2 ? "high" : "auto";
        imgs[index] = img;
        img.onload = () => {
          activeLoads -= 1;
          if (cancelled) return;
          frameState[index] = 2;
          frameReadyRef.current[index] = true;
          if (index < INITIAL_READY_FRAMES) initialReadyCount += 1;
          if (!loadedRef.current) {
            const progress = initialReadyCount / INITIAL_READY_FRAMES;
            setLoadProgress(Math.min(1, progress));
            if (frameState[0] === 2 && initialReadyCount >= INITIAL_READY_FRAMES) {
              loadedRef.current = true;
              setLoaded(true);
            }
          }
          if (Math.abs(index - targetFrameRef.current) <= 1) {
            drawFrameRef.current(targetFrameRef.current);
          }
          evictDistantFrames();
          pumpQueue();
        };
        img.onerror = () => {
          activeLoads -= 1;
          if (cancelled) return;
          frameState[index] = 3;
          if (index < INITIAL_READY_FRAMES) initialReadyCount += 1;
          if (!loadedRef.current) {
            setLoadProgress(Math.min(1, initialReadyCount / INITIAL_READY_FRAMES));
            if (frameState[0] === 2 && initialReadyCount >= INITIAL_READY_FRAMES) {
              loadedRef.current = true;
              setLoaded(true);
            }
          }
          pumpQueue();
        };
        img.src = framePath(index + 1);
      }
    };

    const ensureFrames = (index: number, direction: number) => {
      const travelDirection = direction < 0 ? -1 : 1;
      const desired: number[] = [index];
      for (let distance = 1; distance <= FRAME_LOOK_AHEAD; distance += 1) {
        const ahead = index + distance * FRAME_STEP * travelDirection;
        if (ahead >= 0 && ahead < FRAME_COUNT) desired.push(ahead);
        if (distance <= FRAME_LOOK_BEHIND) {
          const behind = index - distance * FRAME_STEP * travelDirection;
          if (behind >= 0 && behind < FRAME_COUNT) desired.push(behind);
        }
      }
      if (!loadedRef.current) {
        for (let frame = 0; frame < INITIAL_READY_FRAMES; frame += 1) desired.push(frame);
      }
      queue = desired.filter((frame) => frameState[frame] === 0);
      pumpQueue();
    };

    ensureFramesRef.current = ensureFrames;
    ensureFrames(0, 1);

    return () => {
      cancelled = true;
      ensureFramesRef.current = () => undefined;
      for (const image of imgs) {
        if (image) {
          image.onload = null;
          image.onerror = null;
          image.src = "";
        }
      }
    };
  }, []);

  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    let drawableIndex = index;
    if (!frameReadyRef.current[drawableIndex]) {
      for (let distance = 1; distance < FRAME_COUNT; distance += 1) {
        const before = index - distance;
        const after = index + distance;
        if (before >= 0 && frameReadyRef.current[before]) {
          drawableIndex = before;
          break;
        }
        if (after < FRAME_COUNT && frameReadyRef.current[after]) {
          drawableIndex = after;
          break;
        }
      }
    }
    const img = framesRef.current[drawableIndex];
    if (!canvas || !img || !img.complete || !img.naturalWidth) return;
    const ctx = contextRef.current ?? canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });
    if (!ctx) return;
    contextRef.current = ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";

    const cw = canvas.width;
    const ch = canvas.height;
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const canvasRatio = cw / ch;

    let drawW: number;
    let drawH: number;
    if (canvasRatio > imgRatio) {
      drawW = cw;
      drawH = cw / imgRatio;
    } else {
      drawH = ch;
      drawW = ch * imgRatio;
    }

    if (window.innerWidth <= 768) {
      drawW *= 1.3;
      drawH *= 1.3;
    }

    const drawX = (cw - drawW) / 2;
    const drawY = (ch - drawH) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    lastFrameRef.current = drawableIndex;
  }, []);

  useEffect(() => {
    drawFrameRef.current = drawFrame;
  }, [drawFrame]);

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
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(1, 1);
    drawFrame(lastFrameRef.current >= 0 ? lastFrameRef.current : 0);
  }, [drawFrame]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    if (!loaded) return;
    drawFrame(0);
    lastFrameRef.current = 0;
  }, [loaded, drawFrame]);

  useEffect(() => {
    const handleScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;

      requestAnimationFrame(() => {
        tickingRef.current = false;
        const section = sectionRef.current;
        if (!section) return;

        const rect = section.getBoundingClientRect();
        if (rect.top > window.innerHeight || rect.bottom < 0) return;
        const scrollable = section.offsetHeight - window.innerHeight;
        const progress =
          scrollable <= 0
            ? 0
            : Math.min(1, Math.max(0, -rect.top / scrollable));

        const rawFrame = Math.min(
          FRAME_COUNT - 1,
          Math.floor(progress * FRAME_COUNT),
        );
        const frameIndex = Math.min(
          FRAME_COUNT - 1,
          Math.round(rawFrame / FRAME_STEP) * FRAME_STEP,
        );
        const previousFrame = targetFrameRef.current;
        targetFrameRef.current = frameIndex;
        ensureFramesRef.current(frameIndex, Math.sign(frameIndex - previousFrame));
        if (!loadedRef.current) return;
        if (frameIndex !== lastFrameRef.current) {
          drawFrame(frameIndex);
        }

        if (heroTextRef.current) {
          const opacity = Math.max(0, 1 - progress / HERO_TEXT_FADE_END);
          heroTextRef.current.style.opacity = String(opacity);
          heroTextRef.current.style.transform = `translateY(${(1 - opacity) * 12}px)`;
        }

        if (bigLeftTextRef.current) {
          const op = Math.min(1, Math.max(0, (progress - 0.1) / 0.08));
          bigLeftTextRef.current.style.opacity = String(op);
          bigLeftTextRef.current.style.transform = `translateY(${(1 - op) * 14}px)`;
        }

        if (progressFillRef.current) {
          progressFillRef.current.style.transform = `scaleX(${progress})`;
        }

        if (powerReadoutRef.current) {
          const pwr = 87.3 + Math.sin(progress * Math.PI * 2) * 6.7;
          powerReadoutRef.current.textContent = pwr.toFixed(1) + "%";
        }

        const newVisible = new Set<string>();
        for (const d of DIALOGUES) {
          if (progress >= d.show && progress <= d.hide) newVisible.add(d.id);
        }
        const newIds = [...newVisible].sort().join(",");
        if (newIds !== prevVisibleIdsRef.current) {
          prevVisibleIdsRef.current = newIds;
          setVisibleCards(newVisible);
        }
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [drawFrame]);

  return (
    <section ref={sectionRef} className="scroll-animation relative">
      <div
        className="sticky top-0 min-h-[100dvh] w-full overflow-hidden bg-background"
        style={{ height: "100dvh", willChange: "transform", transform: "translateZ(0)" }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ transform: "translateZ(0)" }}
        />

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 10%, transparent 30%, rgba(10,10,11,0.45) 70%, rgba(10,10,11,0.85) 100%)",
          }}
        />

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

        <div
          ref={heroTextRef}
          className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-start gap-5 px-6 pb-24 md:px-12 md:pb-28"
          style={{ transition: "opacity 80ms linear" }}
        >
          <EyebrowBadge>IRON MAN // SHIVAM // ONLINE</EyebrowBadge>
          <h1 className="max-w-[14ch] font-sans text-5xl font-semibold leading-[0.95] tracking-tighter text-foreground md:text-7xl lg:text-8xl">
            I am
            <br />
            <span className="text-accent">Iron Man.</span>
          </h1>
          <p className="max-w-[42ch] font-sans text-sm leading-relaxed text-zinc-400 md:text-base">
            Strength, intelligence, and fearless imagination—an Iron Man
            experience created by Shivam. Scroll to begin the journey.
          </p>
        </div>

        <div
          ref={bigLeftTextRef}
          className="pointer-events-none absolute bottom-24 left-6 z-10 hidden max-w-[58%] flex-col gap-5 md:flex md:bottom-28 md:left-12"
          style={{ opacity: 0, transition: "opacity 80ms linear" }}
        >
          <span className="inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_rgba(212,162,47,0.85)]" />
            Creator Protocol
          </span>
          <h2 className="font-sans font-semibold leading-[0.88] tracking-tighter text-foreground text-[clamp(4rem,9.5vw,9rem)]">
            Built by
            <br />
            <span className="text-accent">Shivam</span>
          </h2>
          <p className="max-w-[36ch] font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-400">
            A bold digital tribute to the power and spirit of Iron Man.
          </p>
        </div>

        <div className="pointer-events-none absolute left-6 top-20 z-10 flex items-center gap-2 md:left-10 md:top-24">
          <div className="h-px w-8 bg-accent/60" />
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-400">
            Shivam &mdash; Live
          </span>
        </div>

        <div className="pointer-events-none absolute right-6 top-20 z-10 flex items-center gap-3 md:right-10 md:top-24">
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-400">
            Arc Reactor
          </span>
          <span
            ref={powerReadoutRef}
            className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent"
          >
            87.3%
          </span>
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_rgba(212,162,47,0.85)]" />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
          <div className="mx-6 mb-3 h-px bg-white/10 md:mx-10">
            <div
              ref={progressFillRef}
              className="h-full origin-left bg-accent"
              style={{ transform: "scaleX(0)", transition: "transform 80ms linear" }}
            />
          </div>
          <div className="mx-6 flex items-center justify-between pb-4 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500 md:mx-10">
            <span>SEQ 001 / 169</span>
            <span>IRON MAN // SHIVAM</span>
            <span>Scroll &darr;</span>
          </div>
        </div>

        {DIALOGUES.map((d) => {
          const visible = visibleCards.has(d.id);
          const position =
            d.id === "d1"
              ? "top-[22%] right-6 md:right-12"
              : d.id === "d2"
              ? "top-1/2 -translate-y-1/2 right-6 md:right-12"
              : "bottom-24 right-6 md:bottom-28 md:right-12";
          return (
            <div
              key={d.id}
              className={`pointer-events-none absolute ${position} z-20 hidden w-[420px] max-w-[90vw] md:block`}
            >
              <figure
                className={`card-surface pointer-events-auto p-6 transition-all duration-400 ease-out ${
                  visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
                }`}
              >
                <blockquote className="font-sans text-xl font-medium leading-snug tracking-tight text-foreground">
                  &ldquo;{d.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 flex items-center justify-between">
                  <span className="font-sans text-sm text-zinc-300">{d.speaker}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
                    {d.film}
                  </span>
                </figcaption>
              </figure>
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex flex-col gap-3 px-6 md:hidden">
          {DIALOGUES.map((d) => {
            const visible = visibleCards.has(d.id);
            return (
              <figure
                key={d.id}
                className={`card-surface pointer-events-auto p-5 transition-all duration-400 ease-out ${
                  visible
                    ? "translate-y-0 opacity-100"
                    : "translate-y-4 opacity-0"
                }`}
              >
                <blockquote className="font-sans text-base font-medium leading-snug text-foreground">
                  &ldquo;{d.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-3 flex items-center justify-between">
                  <span className="font-sans text-xs text-zinc-300">
                    {d.speaker}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-accent">
                    {d.film}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>

        {!loaded && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-background px-6">
            <EyebrowBadge>SUIT UP PROTOCOL // BOOTING</EyebrowBadge>
            <div className="h-px w-60 bg-white/10 md:w-80">
              <div
                className="h-full bg-accent transition-[width] duration-150 ease-out"
                style={{ width: `${Math.round(loadProgress * 100)}%` }}
              />
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-zinc-500">
              Loading Mark LXXXV &nbsp;&middot;&nbsp; {Math.round(loadProgress * 100)}%
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
