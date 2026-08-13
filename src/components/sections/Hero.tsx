"use client";

import { useCallback, useRef } from "react";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { HudFrame } from "@/components/ui/HudFrame";
import { useCanvasImageSequence } from "@/hooks/useCanvasImageSequence";
import { DIALOGUES, FRAME_COUNT, HERO_TEXT_FADE_END, framePath } from "@/lib/hero";
import { updateBeatVisibility } from "@/lib/scrollBeats";

const MAX_CANVAS_PIXELS = 1600 * 900;

export function Hero() {
  const heroTextRef = useRef<HTMLDivElement | null>(null);
  const bigLeftTextRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const powerReadoutRef = useRef<HTMLSpanElement | null>(null);
  const beatElementsRef = useRef<Map<string, HTMLElement>>(new Map());

  const handleProgress = useCallback((progress: number) => {
    if (heroTextRef.current) {
      const opacity = Math.max(0, 1 - progress / HERO_TEXT_FADE_END);
      heroTextRef.current.style.opacity = String(opacity);
      heroTextRef.current.style.transform = `translate3d(0, ${(1 - opacity) * 12}px, 0)`;
    }

    if (bigLeftTextRef.current) {
      const opacity = Math.min(1, Math.max(0, (progress - 0.1) / 0.08));
      bigLeftTextRef.current.style.opacity = String(opacity);
      bigLeftTextRef.current.style.transform = `translate3d(0, ${(1 - opacity) * 14}px, 0)`;
    }

    if (progressFillRef.current) {
      progressFillRef.current.style.transform = `scaleX(${progress})`;
    }

    if (powerReadoutRef.current) {
      const power = 87.3 + Math.sin(progress * Math.PI * 2) * 6.7;
      powerReadoutRef.current.textContent = power.toFixed(1) + "%";
    }

    updateBeatVisibility(beatElementsRef.current, DIALOGUES, progress);
    for (const dialogue of DIALOGUES) {
      const mobileElement = beatElementsRef.current.get(`${dialogue.id}-mobile`);
      if (!mobileElement) continue;
      const visible = progress >= dialogue.show && progress <= dialogue.hide;
      mobileElement.classList.toggle("is-visible", visible);
    }
  }, []);

  const { sectionRef, canvasRef, loadProgress, loaded } = useCanvasImageSequence({
    frameCount: FRAME_COUNT,
    framePath,
    maxCanvasPixels: MAX_CANVAS_PIXELS,
    mobileScale: 1.3,
    onProgress: handleProgress,
  });

  return (
    <section ref={sectionRef} className="scroll-animation relative">
      <div
        className="sticky top-0 min-h-[100dvh] w-full overflow-hidden bg-background"
        style={{ height: "100dvh", transform: "translateZ(0)" }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ transform: "translateZ(0)", contain: "strict" }}
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
        >
          <EyebrowBadge>IRON MAN // SHIVAM // ONLINE</EyebrowBadge>
          <h1 className="max-w-[14ch] font-sans text-5xl font-semibold leading-[0.95] tracking-tighter text-foreground md:text-7xl lg:text-8xl">
            I am
            <br />
            <span className="text-accent">Iron Man.</span>
          </h1>
          <p className="max-w-[42ch] font-sans text-sm leading-relaxed text-zinc-400 md:text-base">
            Strength, intelligence, and fearless imagination&mdash;an Iron Man
            experience created by Shivam. Scroll to begin the journey.
          </p>
        </div>

        <div
          ref={bigLeftTextRef}
          className="pointer-events-none absolute bottom-24 left-6 z-10 hidden max-w-[58%] flex-col gap-5 md:flex md:bottom-28 md:left-12"
          style={{ opacity: 0 }}
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
              style={{ transform: "scaleX(0)" }}
            />
          </div>
          <div className="mx-6 flex items-center justify-between pb-4 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500 md:mx-10">
            <span>SEQ 001 / 169</span>
            <span>IRON MAN // SHIVAM</span>
            <span>Scroll &darr;</span>
          </div>
        </div>

        {DIALOGUES.map((d) => {
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
                ref={(element) => {
                  if (element) beatElementsRef.current.set(d.id, element);
                  else beatElementsRef.current.delete(d.id);
                }}
                className="card-scroll scroll-beat pointer-events-auto p-6"
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
          {DIALOGUES.map((d) => (
              <figure
                key={d.id}
                ref={(element) => {
                  if (element) beatElementsRef.current.set(`${d.id}-mobile`, element);
                  else beatElementsRef.current.delete(`${d.id}-mobile`);
                }}
                className="card-scroll scroll-beat scroll-beat-sm p-5"
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
          ))}
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
