import { describe, expect, it } from 'vitest';
import { countLabel } from '../../apps/web/src/features/count';

describe('Russian count labels', () => {
  const forms = ['объект', 'объекта', 'объектов'] as const;
  it.each([
    [0, '0 объектов'], [1, '1 объект'], [2, '2 объекта'], [4, '4 объекта'],
    [5, '5 объектов'], [11, '11 объектов'], [14, '14 объектов'], [21, '21 объект'],
    [22, '22 объекта'], [25, '25 объектов'], [101, '101 объект'], [111, '111 объектов'],
  ])('formats %i as %s', (count, expected) => {
    expect(countLabel(count, forms)).toBe(expected);
  });
});
