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

export type YoutubeTvPlaybackSignal = "buffering" | "paused" | "playing";

export type YoutubeTvPlaybackAction =
  | "cancelPendingReveal"
  | "ignore"
  | "returnToTuning"
  | "showPosterFallback"
  | "startStabilityCheck";

export const TV_TRANSITION_TIMING = {
  blockedTrailerFallbackMs: 7_000,
  emptySignalHoldMs: 1_000,
  powerOffMs: 180,
  youtubeSignalHoldMs: 200,
  posterSignalHoldMs: 120,
  posterRetryMs: 1_200,
  powerOnMs: 180,
} as const;

export const shouldRevealYoutubeTrailer = (
  phase: TvPhase,
  usePosterFallback: boolean,
  signal: YoutubeTvPlaybackSignal,
): boolean => signal === "playing" && phase === "tuning" && !usePosterFallback;

export const getYoutubePlaybackAction = (
  phase: TvPhase,
  usePosterFallback: boolean,
  signal: YoutubeTvPlaybackSignal,
): YoutubeTvPlaybackAction => {
  if (usePosterFallback || phase === "poweringOff") {
    return "ignore";
  }

  if (signal === "playing") {
    return phase === "tuning" ? "startStabilityCheck" : "ignore";
  }

  if (phase === "tuning") {
    return "cancelPendingReveal";
  }

  if (phase === "playing" && signal === "buffering") {
    return "ignore";
  }

  if (phase === "poweringOn") {
    return "returnToTuning";
  }

  return "showPosterFallback";
};

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
