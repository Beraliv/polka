const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

// Sub-second durations are shown as whole milliseconds; everything above
// a second uses seconds with millisecond precision (zero-padded once a
// minute or hour prefix is present, so components line up: "1m 03.000s").
export function formatDuration(durationMs: number): string {
  const flooredMs = Math.floor(durationMs);
  if (flooredMs < MS_PER_SECOND) {
    return `${flooredMs}ms`;
  }

  const totalSeconds = durationMs / MS_PER_SECOND;
  if (totalSeconds < SECONDS_PER_MINUTE) {
    return `${totalSeconds.toFixed(3)}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const remainingSeconds = totalSeconds - totalMinutes * SECONDS_PER_MINUTE;
  const paddedSeconds = remainingSeconds.toFixed(3).padStart(6, '0');

  if (totalMinutes < MINUTES_PER_HOUR) {
    return `${totalMinutes}m ${paddedSeconds}s`;
  }

  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const remainingMinutes = totalMinutes - hours * MINUTES_PER_HOUR;
  const paddedMinutes = `${remainingMinutes}`.padStart(2, '0');
  return `${hours}h ${paddedMinutes}m ${paddedSeconds}s`;
}
