"use client";

import { useCallback, useRef } from "react";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { HudFrame } from "@/components/ui/HudFrame";
import { useCanvasImageSequence } from "@/hooks/useCanvasImageSequence";
import {
  SPIDER_BEATS,
  SPIDER_FRAME_COUNT,
  spiderFramePath,
} from "@/lib/spiderman";
import { updateBeatVisibility } from "@/lib/scrollBeats";

const MAX_CANVAS_PIXELS = 1280 * 720;
const SCROLL_PIXELS_PER_FRAME = 9;

export function SpiderManReveal() {
  const introRef = useRef<HTMLDivElement | null>(null);
  const outroRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const sequenceRef = useRef<HTMLSpanElement | null>(null);
  const beatElementsRef = useRef<Map<string, HTMLElement>>(new Map());

  const handleProgress = useCallback((progress: number, frameIndex: number) => {
    if (introRef.current) {
      const opacity = Math.max(0, 1 - progress / 0.14);
      introRef.current.style.opacity = String(opacity);
      introRef.current.style.transform = `translate3d(0, ${(1 - opacity) * 14}px, 0)`;
    }
    if (outroRef.current) {
      const opacity = Math.min(1, Math.max(0, (progress - 0.86) / 0.06));
      outroRef.current.style.opacity = String(opacity);
      outroRef.current.style.transform = `translate3d(0, ${(1 - opacity) * 14}px, 0)`;
    }
    if (progressRef.current) {
      progressRef.current.style.transform = `scaleX(${progress})`;
    }
    if (sequenceRef.current) {
      sequenceRef.current.textContent =
        `SEQ ${String(frameIndex + 1).padStart(3, "0")} / ${SPIDER_FRAME_COUNT}`;
    }

    updateBeatVisibility(beatElementsRef.current, SPIDER_BEATS, progress);
    for (const beat of SPIDER_BEATS) {
      const mobileElement = beatElementsRef.current.get(`${beat.id}-mobile`);
      if (!mobileElement) continue;
      const visible = progress >= beat.show && progress <= beat.hide;
      mobileElement.classList.toggle("is-visible", visible);
    }
  }, []);

  const { sectionRef, canvasRef, loadProgress, loaded } = useCanvasImageSequence({
    frameCount: SPIDER_FRAME_COUNT,
    framePath: spiderFramePath,
    maxCanvasPixels: MAX_CANVAS_PIXELS,
    onProgress: handleProgress,
  });

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
        style={{ height: "100dvh", transform: "translateZ(0)" }}
      >
        <canvas
          ref={canvasRef}
          aria-label="Animated Spider-Man cinematic sequence"
          role="img"
          className="absolute inset-0 h-full w-full"
          style={{ transform: "translateZ(0)", contain: "strict" }}
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
            Web Protocol &mdash; Active
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
          const position = index === 0
            ? "top-[22%] right-6 md:right-12"
            : index === 1
              ? "top-1/2 -translate-y-1/2 left-6 md:left-12"
              : "bottom-24 right-6 md:bottom-28 md:right-12";
          return (
            <div key={beat.id} className={`pointer-events-none absolute ${position} z-20 hidden w-[420px] max-w-[90vw] md:block`}>
              <figure
                ref={(element) => {
                  if (element) beatElementsRef.current.set(beat.id, element);
                  else beatElementsRef.current.delete(beat.id);
                }}
                className="card-scroll scroll-beat pointer-events-auto p-6"
              >
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
          {SPIDER_BEATS.map((beat) => (
              <figure
                key={beat.id}
                ref={(element) => {
                  if (element) beatElementsRef.current.set(`${beat.id}-mobile`, element);
                  else beatElementsRef.current.delete(`${beat.id}-mobile`);
                }}
                className="card-scroll scroll-beat scroll-beat-sm p-5"
              >
                <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-accent">{beat.label}</span>
                <blockquote className="mt-2 font-sans text-base font-medium leading-snug text-foreground">&ldquo;{beat.quote}&rdquo;</blockquote>
              </figure>
          ))}
        </div>

        <div
          ref={outroRef}
          className="pointer-events-none absolute bottom-24 left-6 z-10 flex flex-col items-start gap-4 md:bottom-32 md:left-12"
          style={{ opacity: 0 }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Mission &mdash; complete</span>
          <span className="rounded-full border border-white/15 bg-black/30 px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-foreground backdrop-blur-md">
            SpiderMan X Shivam
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
          <div className="mx-6 mb-3 h-px bg-white/10 md:mx-10">
            <div ref={progressRef} className="h-full origin-left bg-accent" style={{ transform: "scaleX(0)" }} />
          </div>
          <div className="mx-6 flex items-center justify-between pb-4 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500 md:mx-10">
            <span>SPIDER-MAN // ACTIVE</span>
            <span>SHIVAM // CREATOR</span>
            <span>Scroll &darr;</span>
          </div>
        </div>

        {!loaded && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-background px-6">
            <EyebrowBadge>WEB SHOOTER // CALIBRATING</EyebrowBadge>
            <div className="h-px w-60 bg-white/10 md:w-80">
              <div className="h-full bg-accent transition-[width] duration-150 ease-out" style={{ width: `${Math.round(loadProgress * 100)}%` }} />
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-zinc-500">
              Loading Spider Verse &nbsp;&middot;&nbsp; {Math.round(loadProgress * 100)}%
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
