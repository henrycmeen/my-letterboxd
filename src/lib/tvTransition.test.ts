import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceTvPhase,
  buildTvPlayerKey,
  getTvRevealDelay,
  getYoutubePlaybackAction,
  INITIAL_TV_PHASE,
  shouldRevealYoutubeTrailer,
  TV_TRANSITION_TIMING,
  type TvPhase,
} from "./tvTransition";

const SHORT_TV_INTRO_MAX_MS = 1_200;
const FAST_TRAILER_REVEAL_MS = 200;
const VISIBLE_POWER_ON_MS = 420;

void test("the TV powers on into analog tuning before the first picture appears", () => {
  let phase: TvPhase = INITIAL_TV_PHASE;

  assert.equal(phase, "poweringOn");

  phase = advanceTvPhase(phase, "powerOnFinished");
  assert.equal(phase, "tuning");

  phase = advanceTvPhase(phase, "signalReady");
  assert.equal(phase, "playing");
});

void test("a movie change powers back on into tuning before the new picture appears", () => {
  let phase: TvPhase = "playing";

  phase = advanceTvPhase(phase, "movieChanged");
  assert.equal(phase, "poweringOff");

  phase = advanceTvPhase(phase, "powerOffFinished");
  assert.equal(phase, "poweringOn");

  phase = advanceTvPhase(phase, "powerOnFinished");
  assert.equal(phase, "tuning");

  phase = advanceTvPhase(phase, "signalReady");
  assert.equal(phase, "playing");
});

void test("reveals a confirmed YouTube trailer after 0.2 seconds", () => {
  assert.equal(
    TV_TRANSITION_TIMING.youtubeSignalHoldMs,
    FAST_TRAILER_REVEAL_MS,
  );
  assert.ok(
    TV_TRANSITION_TIMING.posterSignalHoldMs <
      TV_TRANSITION_TIMING.youtubeSignalHoldMs,
  );
});

void test("keeps the CRT power-on phase long enough to read as a TV turning on", () => {
  assert.equal(TV_TRANSITION_TIMING.powerOnMs, VISIBLE_POWER_ON_MS);
});

void test("an empty vote board leaves tuning after the same bounded intro", () => {
  assert.ok(TV_TRANSITION_TIMING.emptySignalHoldMs <= SHORT_TV_INTRO_MAX_MS);
  assert.equal(
    getTvRevealDelay(null, "emptyReady"),
    TV_TRANSITION_TIMING.emptySignalHoldMs,
  );
});

void test("YouTube playback uses one bounded control-masking hold", () => {
  const revealDelay = getTvRevealDelay("trailer-a", "youtubePlaying");

  assert.ok(revealDelay !== null);
  assert.equal(revealDelay, TV_TRANSITION_TIMING.youtubeSignalHoldMs);
  assert.equal(revealDelay, FAST_TRAILER_REVEAL_MS);
});

void test("only an active YouTube playing signal may begin the reveal", () => {
  assert.equal(shouldRevealYoutubeTrailer("tuning", false, "paused"), false);
  assert.equal(
    shouldRevealYoutubeTrailer("poweringOn", false, "paused"),
    false,
  );
  assert.equal(shouldRevealYoutubeTrailer("playing", false, "paused"), false);
  assert.equal(
    shouldRevealYoutubeTrailer("poweringOff", false, "paused"),
    false,
  );
  assert.equal(shouldRevealYoutubeTrailer("tuning", true, "playing"), false);
  assert.equal(shouldRevealYoutubeTrailer("tuning", false, "playing"), true);
});

void test("YouTube playback actions keep the trailer reveal stable on mobile", () => {
  assert.equal(
    getYoutubePlaybackAction("tuning", false, "playing"),
    "startStabilityCheck",
  );

  assert.equal(
    getYoutubePlaybackAction("tuning", false, "paused"),
    "cancelPendingReveal",
  );
  assert.equal(
    getYoutubePlaybackAction("tuning", false, "buffering"),
    "cancelPendingReveal",
  );
  assert.equal(
    getYoutubePlaybackAction("poweringOn", false, "paused"),
    "cancelPendingReveal",
  );
  assert.equal(
    getYoutubePlaybackAction("poweringOn", false, "buffering"),
    "cancelPendingReveal",
  );
  assert.equal(
    getYoutubePlaybackAction("playing", false, "paused"),
    "showPosterFallback",
  );
  assert.equal(
    getYoutubePlaybackAction("playing", false, "buffering"),
    "ignore",
  );

  for (const signal of ["playing", "paused", "buffering"] as const) {
    assert.equal(getYoutubePlaybackAction("tuning", true, signal), "ignore");
  }

  assert.equal(
    getYoutubePlaybackAction("poweringOff", false, "playing"),
    "ignore",
  );
});

void test("irrelevant phase events do not skip the signal transition", () => {
  assert.equal(advanceTvPhase("poweringOff", "signalReady"), "poweringOff");
  assert.equal(advanceTvPhase("playing", "powerOnFinished"), "playing");
});

void test("the same trailer can be remounted after a rapid A to B to A switch", () => {
  assert.notEqual(
    buildTvPlayerKey("trailer-a", 1),
    buildTvPlayerKey("trailer-a", 2),
  );
});

void test("a blocked YouTube player falls back to the poster instead of tuning forever", () => {
  assert.ok(
    TV_TRANSITION_TIMING.blockedTrailerFallbackMs >=
      TV_TRANSITION_TIMING.youtubeSignalHoldMs + 2_000,
  );
  assert.ok(TV_TRANSITION_TIMING.blockedTrailerFallbackMs <= 8_000);
  assert.equal(getTvRevealDelay("trailer-a", "playerFallback"), null);
  assert.equal(
    getTvRevealDelay("trailer-a", "youtubePlaying"),
    TV_TRANSITION_TIMING.youtubeSignalHoldMs,
  );
});

void test("successful and blocked players both leave tuning within bounded totals", () => {
  const successfulTotal =
    TV_TRANSITION_TIMING.youtubeSignalHoldMs + TV_TRANSITION_TIMING.powerOnMs;
  const blockedTotal =
    TV_TRANSITION_TIMING.blockedTrailerFallbackMs +
    TV_TRANSITION_TIMING.posterSignalHoldMs +
    TV_TRANSITION_TIMING.powerOnMs;

  assert.ok(successfulTotal <= 5_200);
  assert.ok(blockedTotal <= 8_500);
  assert.ok(TV_TRANSITION_TIMING.posterRetryMs >= 800);
  assert.ok(TV_TRANSITION_TIMING.posterRetryMs <= 2_000);
});

void test("a film without a trailer can still reveal its poster", () => {
  assert.equal(
    getTvRevealDelay(null, "posterReady"),
    TV_TRANSITION_TIMING.posterSignalHoldMs,
  );
});
