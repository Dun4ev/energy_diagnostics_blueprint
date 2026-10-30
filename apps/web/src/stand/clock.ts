import type { StandScene } from './package';

export type StandClock = { index: number; elapsed: number };

/** Advance only elapsed visible playback time, wrapping over all eight scenes. */
export function advanceStandClock(clock: StandClock, delta: number, scenes: StandScene[]): StandClock {
  let { index, elapsed } = clock;
  elapsed += delta;
  const cycle = scenes.reduce((sum, scene) => sum + scene.durationSeconds * 1000, 0);
  if (elapsed >= cycle) elapsed %= cycle;
  while (elapsed >= scenes[index].durationSeconds * 1000) {
    elapsed -= scenes[index].durationSeconds * 1000;
    index = (index + 1) % scenes.length;
  }
  return { index, elapsed };
}
