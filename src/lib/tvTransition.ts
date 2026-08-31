export type TvPhase = "tuning" | "poweringOff" | "poweringOn" | "playing";

export type TvTransitionEvent =
  | "movieChanged"
  | "powerOffFinished"
  | "signalReady"
  | "powerOnFinished";

export type TvRevealSource =
  | "emptyReady"
  | "playerFallback"
  | "posterReady"
  | "youtubePlaying";

export const TV_TRANSITION_TIMING = {
  blockedTrailerFallbackMs: 4_000,
  emptySignalHoldMs: 4_000,
  powerOffMs: 520,
  youtubeSignalHoldMs: 4_000,
  posterSignalHoldMs: 650,
  powerOnMs: 760,
} as const;

export const getTvRevealDelay = (
  youtubeId: string | null,
  source: TvRevealSource,
): number | null => {
  if (youtubeId) {
    return source === "youtubePlaying"
      ? TV_TRANSITION_TIMING.youtubeSignalHoldMs
      : null;
  }

  if (source === "emptyReady") {
    return TV_TRANSITION_TIMING.emptySignalHoldMs;
  }

  return source === "posterReady"
    ? TV_TRANSITION_TIMING.posterSignalHoldMs
    : null;
};

export const buildTvPlayerKey = (
  youtubeId: string,
  generation: number,
): string => `${youtubeId}:${generation}`;

export const advanceTvPhase = (
  phase: TvPhase,
  event: TvTransitionEvent,
): TvPhase => {
  if (event === "movieChanged") {
    return "poweringOff";
  }
  if (phase === "poweringOff" && event === "powerOffFinished") {
    return "tuning";
  }
  if (phase === "tuning" && event === "signalReady") {
    return "poweringOn";
  }
  if (phase === "poweringOn" && event === "powerOnFinished") {
    return "playing";
  }
  return phase;
};
