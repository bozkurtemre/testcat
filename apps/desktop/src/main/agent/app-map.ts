export const APP_MAP_MAX_CHARS = 6_000;

/**
 * Prompt block injected into a run from the cached per-build app map. Same
 * "speed hint, not current truth" framing as the last-success guide: the map
 * guides navigation strategy, but coordinates must always be recomputed live.
 */
export function appMapPromptBlock(appMap: string | null | undefined): string {
  const trimmed = appMap?.trim();
  if (!trimmed) return "";
  return [
    "APP MAP (per-build exploration)",
    "A stronger model explored this build once and produced the map below. Use it to navigate faster, but treat it as a hint, not current truth:",
    "- Verify each screen against the current accessibility tree before acting.",
    "- Recompute coordinates from the latest describe-ui; never reuse coordinates from this map.",
    "- If the live UI differs from the map, adapt to what is on screen and continue.",
    "",
    trimmed.length <= APP_MAP_MAX_CHARS
      ? trimmed
      : `${trimmed.slice(0, APP_MAP_MAX_CHARS - 24).trim()}\n...[app map truncated]`,
  ].join("\n");
}
