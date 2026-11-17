import { describe, expect, it } from 'vitest';
import { votdIndex } from '../src/lib/votd.ts';

describe('votdIndex', () => {
  it('is stable within a day and changes the next day', () => {
    const morning = new Date(2026, 10, 17, 6, 0);
    const night = new Date(2026, 10, 17, 23, 59);
    const tomorrow = new Date(2026, 10, 18, 0, 1);
    expect(votdIndex(morning, 'day', 362)).toBe(votdIndex(night, 'day', 362));
    expect(votdIndex(tomorrow, 'day', 362)).not.toBe(votdIndex(night, 'day', 362));
  });

  it('changes every hour', () => {
    const a = new Date(2026, 10, 17, 6, 5);
    const b = new Date(2026, 10, 17, 6, 55);
    const c = new Date(2026, 10, 17, 7, 5);
    expect(votdIndex(a, 'hour', 362)).toBe(votdIndex(b, 'hour', 362));
    expect(votdIndex(c, 'hour', 362)).not.toBe(votdIndex(b, 'hour', 362));
  });

  it('visits every verse over a full cycle of days', () => {
    const seen = new Set<number>();
    for (let d = 0; d < 362; d++) seen.add(votdIndex(new Date(2026, 0, 1 + d), 'day', 362));
    expect(seen.size).toBe(362);
  });

  it('always returns a valid index', () => {
    for (let h = 0; h < 1000; h++) {
      const i = votdIndex(new Date(Date.UTC(2026, 0, 1) + h * 3_600_000), 'hour', 362);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(362);
    }
  });
});
