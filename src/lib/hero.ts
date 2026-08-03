export const FRAME_COUNT = 169;

export const framePath = (n: number) =>
  `/frames/frame_${String(n).padStart(4, "0")}.jpg`;

export type Dialogue = {
  id: string;
  show: number;
  hide: number;
  quote: string;
  speaker: string;
  film: string;
};

export const DIALOGUES: Dialogue[] = [
  {
    id: "d1",
    show: 0.1,
    hide: 0.3,
    quote: "Dream beyond limits. Build beyond expectations.",
    speaker: "Shivam",
    film: "CREATOR",
  },
  {
    id: "d2",
    show: 0.35,
    hide: 0.55,
    quote: "Power is strongest when guided by purpose.",
    speaker: "Iron Man",
    film: "HERO",
  },
  {
    id: "d3",
    show: 0.6,
    hide: 0.8,
    quote: "Technology becomes extraordinary when imagination takes flight.",
    speaker: "Shivam",
    film: "VISION",
  },
];

export const HERO_TEXT_FADE_END = 0.08;
