import { describe, expect, it } from 'vitest';
import { advanceStandClock } from '../../apps/web/src/stand/clock';
import type { StandScene } from '../../apps/web/src/stand/package';

const durations = [15, 20, 30, 25, 20, 25, 25, 20];
const scenes = durations.map((durationSeconds, index) => ({ durationSeconds, id: String(index) })) as StandScene[];

describe('stand presentation clock', () => {
  it('moves through the actual 180 second schedule and wraps twice', () => {
    let clock = { index: 0, elapsed: 0 };
    const visited: number[] = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const duration of durations) {
        visited.push(clock.index);
        clock = advanceStandClock(clock, duration * 1000, scenes);
      }
    }
    expect(visited).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(clock).toEqual({ index: 0, elapsed: 0 });
  });

  it('handles elapsed time across multiple scenes and whole cycles', () => {
    expect(advanceStandClock({ index: 0, elapsed: 4000 }, 33_500, scenes)).toEqual({ index: 2, elapsed: 2500 });
    expect(advanceStandClock({ index: 4, elapsed: 2500 }, 360_000, scenes)).toEqual({ index: 4, elapsed: 2500 });
  });
});
