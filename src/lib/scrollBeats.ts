type BeatLike = { id: string; show: number; hide: number };

export function updateBeatVisibility(
  elements: Map<string, HTMLElement>,
  beats: BeatLike[],
  progress: number,
) {
  for (const beat of beats) {
    const element = elements.get(beat.id);
    if (!element) continue;
    const visible = progress >= beat.show && progress <= beat.hide;
    element.classList.toggle("is-visible", visible);
  }
}
