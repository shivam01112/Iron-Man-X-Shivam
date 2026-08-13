"use client";

import { useCallback, useRef } from "react";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { HudFrame } from "@/components/ui/HudFrame";
import { useCanvasImageSequence } from "@/hooks/useCanvasImageSequence";
import { BEATS, CINE_FRAME_COUNT, cineFramePath } from "@/lib/cinematic";
import { updateBeatVisibility } from "@/lib/scrollBeats";

const MAX_CANVAS_PIXELS = 1600 * 900;

export function CinematicReveal() {
  const h2InevitableRef = useRef<HTMLHeadingElement | null>(null);
  const h2IronManRef = useRef<HTMLHeadingElement | null>(null);
  const outroRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const seqReadoutRef = useRef<HTMLSpanElement | null>(null);
  const beatElementsRef = useRef<Map<string, HTMLElement>>(new Map());

  const handleProgress = useCallback((progress: number, frameIndex: number) => {
    if (h2InevitableRef.current) {
      const opacity = Math.min(1, Math.max(0, (0.52 - progress) / 0.1));
      h2InevitableRef.current.style.opacity = String(opacity);
    }

    if (h2IronManRef.current) {
      const opacity = Math.min(1, Math.max(0, (progress - 0.48) / 0.1));
      h2IronManRef.current.style.opacity = String(opacity);
    }

    if (outroRef.current) {
      const opacity = Math.min(1, Math.max(0, (progress - 0.86) / 0.06));
      outroRef.current.style.opacity = String(opacity);
      outroRef.current.style.transform = `translate3d(0, ${(1 - opacity) * 14}px, 0)`;
    }

    if (progressFillRef.current) {
      progressFillRef.current.style.transform = `scaleX(${progress})`;
    }

    if (seqReadoutRef.current) {
      const frameNumber = Math.min(CINE_FRAME_COUNT, frameIndex + 1);
      seqReadoutRef.current.textContent =
        `SEQ ${String(frameNumber).padStart(3, "0")} / ${CINE_FRAME_COUNT}`;
    }

    updateBeatVisibility(beatElementsRef.current, BEATS, progress);
    for (const beat of BEATS) {
      const mobileElement = beatElementsRef.current.get(`${beat.id}-mobile`);
      if (!mobileElement) continue;
      const visible = progress >= beat.show && progress <= beat.hide;
      mobileElement.classList.toggle("is-visible", visible);
    }
  }, []);

  const { sectionRef, canvasRef, loadProgress, loaded } = useCanvasImageSequence({
    frameCount: CINE_FRAME_COUNT,
    framePath: cineFramePath,
    maxCanvasPixels: MAX_CANVAS_PIXELS,
    mobileScale: 1.3,
    onProgress: handleProgress,
  });

  return (
    <section
      ref={sectionRef}
      id="cinematic"
      className="scroll-animation relative border-t border-white/5 bg-background"
    >
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
              style={{ opacity: 1 }}
            >
              I am
              <br />
              <span className="text-accent">Shivam.</span>
            </h2>
            <h2
              ref={h2IronManRef}
              className="absolute inset-0 font-sans text-4xl font-semibold leading-[0.98] tracking-tighter text-foreground md:text-6xl lg:text-7xl"
              style={{ opacity: 0 }}
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
              style={{ transform: "scaleX(0)" }}
            />
          </div>
          <div className="mx-6 flex items-center justify-between pb-4 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500 md:mx-10">
            <span>IRON MAN // ACTIVE</span>
            <span>SHIVAM // CREATOR</span>
            <span>Scroll &darr;</span>
          </div>
        </div>

        {BEATS.map((b, i) => {
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
                ref={(element) => {
                  if (element) beatElementsRef.current.set(b.id, element);
                  else beatElementsRef.current.delete(b.id);
                }}
                className="card-scroll scroll-beat pointer-events-auto p-6"
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
          {BEATS.map((b) => (
              <figure
                key={b.id}
                ref={(element) => {
                  if (element) beatElementsRef.current.set(`${b.id}-mobile`, element);
                  else beatElementsRef.current.delete(`${b.id}-mobile`);
                }}
                className="card-scroll scroll-beat scroll-beat-sm p-5"
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
          ))}
        </div>

        <div
          ref={outroRef}
          className="pointer-events-none absolute bottom-24 right-6 z-10 flex flex-col items-end gap-4 md:bottom-32 md:right-12"
          style={{ opacity: 0 }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
            Journey &mdash; complete
          </span>
          <span className="rounded-full border border-white/15 bg-white/[0.06] px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-foreground backdrop-blur-md">
            Iron Man &times; Shivam
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
