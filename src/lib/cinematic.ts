export const CINE_FRAME_COUNT = 169;

export const cineFramePath = (n: number) =>
  `/frames2/frame_${String(n).padStart(4, "0")}.jpg`;

export type Beat = {
  id: string;
  show: number;
  hide: number;
  label: string;
  quote: string;
  speaker: string;
  film: string;
};

export const BEATS: Beat[] = [
  {
    id: "b1",
    show: 0.1,
    hide: 0.3,
    label: "01 — Vision",
    quote: "Every powerful creation begins with a fearless idea.",
    speaker: "Shivam",
    film: "CREATOR",
  },
  {
    id: "b2",
    show: 0.35,
    hide: 0.55,
    label: "02 — Power",
    quote: "The armor is technology. The courage inside makes the hero.",
    speaker: "Iron Man",
    film: "HERO",
  },
  {
    id: "b3",
    show: 0.6,
    hide: 0.8,
    label: "03 — Legacy",
    quote: "Create boldly, keep moving, and leave something unforgettable.",
    speaker: "Shivam",
    film: "VISION",
  },
];

export const CINE_INTRO_FADE_END = 0.08;
