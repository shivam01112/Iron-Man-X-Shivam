// Keep this in sync with the optimized sequence in public/frames3.
// The sequence is intentionally shorter so the browser never requests missing
// frames and can keep the animation responsive on slower connections.
export const SPIDER_FRAME_COUNT = 202;

export const spiderFramePath = (n: number) =>
  `/frames3/frame_${String(n).padStart(5, "0")}.webp`;

export type SpiderBeat = {
  id: string;
  show: number;
  hide: number;
  label: string;
  quote: string;
};

export const SPIDER_BEATS: SpiderBeat[] = [
  {
    id: "origin",
    show: 0.12,
    hide: 0.3,
    label: "01 — Instinct",
    quote: "Trust the instinct. Take the leap.",
  },
  {
    id: "power",
    show: 0.38,
    hide: 0.57,
    label: "02 — Responsibility",
    quote: "Real power is choosing what you stand for.",
  },
  {
    id: "legacy",
    show: 0.66,
    hide: 0.84,
    label: "03 — Beyond",
    quote: "The mask is iconic. The person behind it makes the hero.",
  },
];
