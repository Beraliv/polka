// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { formatDuration } from './formatDuration.ts';

describe('formatDuration', () => {
  it('shows sub-second durations as rounded milliseconds', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(342)).toBe('342ms');
    expect(formatDuration(999.4)).toBe('999ms');
    expect(formatDuration(999.6)).toBe('999ms');
  });

  it('shows durations under a minute as seconds with millisecond precision', () => {
    expect(formatDuration(1000)).toBe('1.000s');
    expect(formatDuration(12345)).toBe('12.345s');
    expect(formatDuration(59999)).toBe('59.999s');
  });

  it('shows durations under an hour as zero-padded minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 00.000s');
    expect(formatDuration(83000)).toBe('1m 23.000s');
    expect(formatDuration(3599999)).toBe('59m 59.999s');
  });

  it('shows durations of an hour or more as hours, minutes, and seconds', () => {
    expect(formatDuration(3600000)).toBe('1h 00m 00.000s');
    expect(formatDuration(3723456)).toBe('1h 02m 03.456s');
    expect(formatDuration(36_000_000)).toBe('10h 00m 00.000s');
  });
});
