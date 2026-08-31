export type TvPhase = "tuning" | "poweringOff" | "poweringOn" | "playing";

export type TvTransitionEvent =
  | "movieChanged"
  | "powerOffFinished"
  | "signalReady"
  | "powerOnFinished";

export const TV_TRANSITION_TIMING = {
  powerOffMs: 520,
  youtubeSignalHoldMs: 3_000,
  posterSignalHoldMs: 900,
  powerOnMs: 760,
  playerFallbackMs: 9_000,
} as const;

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
