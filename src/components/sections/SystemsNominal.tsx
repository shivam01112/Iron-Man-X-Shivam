"use client";

import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { AnimatedItem, AnimatedSection } from "@/components/ui/AnimatedSection";

const telemetry = [
  { label: "Suit Integrity", value: "99.2%", note: "Iron Man armor online" },
  { label: "Creative Energy", value: "100%", note: "Powered by Shivam" },
  { label: "Flight Ceiling", value: "72.8 km", note: "Ready to rise" },
  { label: "Response Time", value: "0.018 s", note: "Fast. Focused. Fearless." },
];

export function SystemsNominal() {
  return (
    <section
      id="systems"
      className="relative border-t border-white/5 bg-background px-6 pb-28 pt-24 md:px-10 md:pb-40 md:pt-32"
    >
      <div className="mx-auto flex max-w-[1400px] flex-col gap-16 md:grid md:grid-cols-[5fr_4fr] md:gap-20">
        <AnimatedSection className="flex flex-col gap-8">
          <AnimatedItem>
            <EyebrowBadge>SHIVAM // SYSTEMS NOMINAL</EyebrowBadge>
          </AnimatedItem>
          <AnimatedItem>
            <h2 className="max-w-[16ch] font-sans text-4xl font-semibold leading-[0.98] tracking-tighter text-foreground md:text-6xl">
              The mind of <span className="text-accent">Shivam.</span>
              <br />
              The spirit of Iron Man.
            </h2>
          </AnimatedItem>
          <AnimatedItem>
            <p className="max-w-[48ch] font-sans text-base leading-relaxed text-zinc-400 md:text-lg">
              This experience combines Shivam&apos;s creative vision with Iron
              Man&apos;s fearless energy—built to feel precise, powerful, and
              impossible to ignore.
            </p>
          </AnimatedItem>
        </AnimatedSection>

        <AnimatedSection className="flex flex-col divide-y divide-white/8 border-t border-white/8 font-mono md:mt-3">
          {telemetry.map((row) => (
            <AnimatedItem key={row.label}>
              <div className="flex items-baseline justify-between gap-6 py-5">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">
                    {row.label}
                  </span>
                  <span className="font-sans text-[13px] text-zinc-400">
                    {row.note}
                  </span>
                </div>
                <span className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {row.value}
                </span>
              </div>
            </AnimatedItem>
          ))}
        </AnimatedSection>
      </div>
    </section>
  );
}
