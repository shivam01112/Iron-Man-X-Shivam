"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { HudFrame } from "@/components/ui/HudFrame";
import { BEATS, CINE_FRAME_COUNT, cineFramePath } from "@/lib/cinematic";

const INITIAL_READY_FRAMES = 6;
const FRAME_LOOK_AHEAD = 10;
const FRAME_LOOK_BEHIND = 3;
const MAX_CACHED_FRAMES = 22;
const PARALLEL_LOADS = 3;
const FRAME_STEP = 2;
const MAX_CANVAS_PIXELS = 1280 * 720;

export function CinematicReveal() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const h2InevitableRef = useRef<HTMLHeadingElement | null>(null);
  const h2IronManRef = useRef<HTMLHeadingElement | null>(null);
  const outroRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const seqReadoutRef = useRef<HTMLSpanElement | null>(null);

  const framesRef = useRef<HTMLImageElement[]>([]);
  const frameReadyRef = useRef<boolean[]>([]);
  const drawFrameRef = useRef<(index: number) => void>(() => undefined);
  const ensureFramesRef = useRef<(index: number, direction: number) => void>(() => undefined);
  const loadingStartedRef = useRef(false);
  const tickingRef = useRef(false);
  const loadedRef = useRef(false);
  const lastFrameRef = useRef(-1);
  const targetFrameRef = useRef(0);
  const prevVisibleIdsRef = useRef("");

  const [loadProgress, setLoadProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [visibleBeats, setVisibleBeats] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let activeLoads = 0;
    let queue: number[] = [];
    let initialReadyCount = 0;
    const imgs = new Array<HTMLImageElement>(CINE_FRAME_COUNT);
    const frameState = new Array<0 | 1 | 2 | 3>(CINE_FRAME_COUNT).fill(0);
    frameReadyRef.current = new Array<boolean>(CINE_FRAME_COUNT).fill(false);
    framesRef.current = imgs;

    const evictDistantFrames = () => {
      const ready: number[] = [];
      for (let index = 0; index < CINE_FRAME_COUNT; index += 1) {
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
        img.fetchPriority = index === 0 ? "high" : "auto";
        imgs[index] = img;
        img.onload = () => {
          activeLoads -= 1;
          if (cancelled) return;
          frameState[index] = 2;
          frameReadyRef.current[index] = true;
          if (index < INITIAL_READY_FRAMES) initialReadyCount += 1;
          if (!loadedRef.current) {
            setLoadProgress(Math.min(1, initialReadyCount / INITIAL_READY_FRAMES));
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
        img.src = cineFramePath(index + 1);
      }
    };

    const ensureFrames = (index: number, direction: number) => {
      const travelDirection = direction < 0 ? -1 : 1;
      const desired: number[] = [index];
      for (let distance = 1; distance <= FRAME_LOOK_AHEAD; distance += 1) {
        const ahead = index + distance * FRAME_STEP * travelDirection;
        if (ahead >= 0 && ahead < CINE_FRAME_COUNT) desired.push(ahead);
        if (distance <= FRAME_LOOK_BEHIND) {
          const behind = index - distance * FRAME_STEP * travelDirection;
          if (behind >= 0 && behind < CINE_FRAME_COUNT) desired.push(behind);
        }
      }
      if (!loadedRef.current) {
        for (let frame = 0; frame < INITIAL_READY_FRAMES; frame += 1) desired.push(frame);
      }
      queue = [...new Set(desired)].filter((frame) => frameState[frame] === 0);
      pumpQueue();
    };
    ensureFramesRef.current = ensureFrames;

    const startLoading = () => {
      if (loadingStartedRef.current || cancelled) return;
      loadingStartedRef.current = true;
      ensureFrames(targetFrameRef.current, 1);
    };

    const section = sectionRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) startLoading();
      },
      { rootMargin: "75% 0px" },
    );
    if (section) observer.observe(section);

    return () => {
      cancelled = true;
      loadingStartedRef.current = false;
      ensureFramesRef.current = () => undefined;
      observer.disconnect();
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
      for (let distance = 1; distance < CINE_FRAME_COUNT; distance += 1) {
        const before = index - distance;
        const after = index + distance;
        if (before >= 0 && frameReadyRef.current[before]) {
          drawableIndex = before;
          break;
        }
        if (after < CINE_FRAME_COUNT && frameReadyRef.current[after]) {
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
        if (!section || !loadedRef.current) return;

        const rect = section.getBoundingClientRect();
        if (rect.top > window.innerHeight || rect.bottom < 0) return;
        const scrollable = section.offsetHeight - window.innerHeight;
        const progress =
          scrollable <= 0
            ? 0
            : Math.min(1, Math.max(0, -rect.top / scrollable));

        const rawFrame = Math.min(
          CINE_FRAME_COUNT - 1,
          Math.floor(progress * CINE_FRAME_COUNT),
        );
        const frameIndex = Math.min(
          CINE_FRAME_COUNT - 1,
          Math.round(rawFrame / FRAME_STEP) * FRAME_STEP,
        );
        const previousFrame = targetFrameRef.current;
        targetFrameRef.current = frameIndex;
        if (loadingStartedRef.current) {
          ensureFramesRef.current(frameIndex, Math.sign(frameIndex - previousFrame));
        }
        if (frameIndex !== lastFrameRef.current) {
          drawFrame(frameIndex);
        }

        if (h2InevitableRef.current) {
          const op = Math.min(1, Math.max(0, (0.52 - progress) / 0.1));
          h2InevitableRef.current.style.opacity = String(op);
        }

        if (h2IronManRef.current) {
          const op = Math.min(1, Math.max(0, (progress - 0.48) / 0.1));
          h2IronManRef.current.style.opacity = String(op);
        }

        if (outroRef.current) {
          const op = Math.min(1, Math.max(0, (progress - 0.86) / 0.06));
          outroRef.current.style.opacity = String(op);
          outroRef.current.style.transform = `translateY(${(1 - op) * 14}px)`;
        }

        if (progressFillRef.current) {
          progressFillRef.current.style.transform = `scaleX(${progress})`;
        }

        if (seqReadoutRef.current) {
          const n = Math.min(CINE_FRAME_COUNT, frameIndex + 1);
          seqReadoutRef.current.textContent =
            `SEQ ${String(n).padStart(3, "0")} / ${CINE_FRAME_COUNT}`;
        }

        const newVisible = new Set<string>();
        for (const b of BEATS) {
          if (progress >= b.show && progress <= b.hide) newVisible.add(b.id);
        }
        const newIds = [...newVisible].sort().join(",");
        if (newIds !== prevVisibleIdsRef.current) {
          prevVisibleIdsRef.current = newIds;
          setVisibleBeats(newVisible);
        }
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [drawFrame]);

  return (
    <section
      ref={sectionRef}
      id="cinematic"
      className="scroll-animation relative border-t border-white/5 bg-background"
    >
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
              "radial-gradient(120% 80% at 50% 90%, transparent 30%, rgba(10,10,11,0.45) 70%, rgba(10,10,11,0.85) 100%)",
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

        <div className="pointer-events-none absolute right-6 top-28 z-10 flex max-w-[46ch] flex-col items-end gap-5 text-right md:right-12 md:top-32">
          <EyebrowBadge>SHIVAM // CREATOR MODE</EyebrowBadge>
          <div className="relative self-stretch">
            <h2
              ref={h2InevitableRef}
              className="font-sans text-4xl font-semibold leading-[0.98] tracking-tighter text-foreground md:text-6xl lg:text-7xl"
              style={{ transition: "opacity 240ms ease-out" }}
            >
              I am
              <br />
              <span className="text-accent">Shivam.</span>
            </h2>
            <h2
              ref={h2IronManRef}
              className="absolute inset-0 font-sans text-4xl font-semibold leading-[0.98] tracking-tighter text-foreground md:text-6xl lg:text-7xl"
              style={{ opacity: 0, transition: "opacity 240ms ease-out" }}
            >
              And I am
              <br />
              <span className="text-accent">Iron Man.</span>
            </h2>
          </div>
          <p className="max-w-[42ch] font-sans text-sm leading-relaxed text-zinc-400 md:text-base">
            One creator. One iconic hero. A cinematic experience where Shivam&apos;s
            imagination meets the unstoppable spirit of Iron Man.
          </p>
        </div>

        <div className="pointer-events-none absolute left-6 top-20 z-10 flex items-center gap-2 md:left-10 md:top-24">
          <div className="h-px w-8 bg-accent/60" />
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-400">
            Creator Log &mdash; Active
          </span>
        </div>

        <div className="pointer-events-none absolute right-6 top-20 z-10 flex items-center gap-3 md:right-10 md:top-24">
          <span
            ref={seqReadoutRef}
            className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent"
          >
            SEQ 001 / {CINE_FRAME_COUNT}
          </span>
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_rgba(212,162,47,0.85)]"
          />
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
            <span>IRON MAN // ACTIVE</span>
            <span>SHIVAM // CREATOR</span>
            <span>Scroll &darr;</span>
          </div>
        </div>

        {BEATS.map((b, i) => {
          const visible = visibleBeats.has(b.id);
          const position =
            i === 0
              ? "top-[24%] left-6 md:left-12"
              : i === 1
              ? "top-1/2 -translate-y-1/2 left-6 md:left-12"
              : "bottom-24 left-6 md:bottom-28 md:left-12";
          return (
            <div
              key={b.id}
              className={`pointer-events-none absolute ${position} z-20 hidden w-[420px] max-w-[90vw] md:block`}
            >
              <figure
                className={`card-surface pointer-events-auto p-6 transition-all duration-400 ease-out ${
                  visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
                }`}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
                  {b.label}
                </span>
                <blockquote className="mt-3 font-sans text-xl font-medium leading-snug tracking-tight text-foreground">
                  &ldquo;{b.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 flex items-center justify-between">
                  <span className="font-sans text-sm text-zinc-300">{b.speaker}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400">
                    {b.film}
                  </span>
                </figcaption>
              </figure>
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-x-0 top-[36%] z-20 flex flex-col gap-3 px-6 md:hidden">
          {BEATS.map((b) => {
            const visible = visibleBeats.has(b.id);
            return (
              <figure
                key={b.id}
                className={`card-surface pointer-events-auto p-5 transition-all duration-400 ease-out ${
                  visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
              >
                <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-accent">
                  {b.label}
                </span>
                <blockquote className="mt-2 font-sans text-base font-medium leading-snug text-foreground">
                  &ldquo;{b.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-3 flex items-center justify-between">
                  <span className="font-sans text-xs text-zinc-300">{b.speaker}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-400">
                    {b.film}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>

        <div
          ref={outroRef}
          className="pointer-events-none absolute bottom-24 right-6 z-10 flex flex-col items-end gap-4 md:bottom-32 md:right-12"
          style={{ opacity: 0, transition: "opacity 80ms linear" }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
            Journey &mdash; complete
          </span>
          <span className="rounded-full border border-white/15 bg-white/[0.06] px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-foreground backdrop-blur-md">
            Iron Man × Shivam
          </span>
        </div>

        {!loaded && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-background px-6">
            <EyebrowBadge>FLIGHT LOG // RESTORING</EyebrowBadge>
            <div className="h-px w-60 bg-white/10 md:w-80">
              <div
                className="h-full bg-accent transition-[width] duration-150 ease-out"
                style={{ width: `${Math.round(loadProgress * 100)}%` }}
              />
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-zinc-500">
              Rendering Mark III &nbsp;&middot;&nbsp; {Math.round(loadProgress * 100)}%
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
