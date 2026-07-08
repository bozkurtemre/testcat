export function formatSecondsAndMinutes(durationMs: number): string {
  const seconds = durationMs / 1000;
  const minutes = seconds / 60;
  return `${seconds.toFixed(1)}s (${minutes.toFixed(1)}m)`;
}
