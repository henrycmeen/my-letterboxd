import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceTvPhase,
  buildTvPlayerKey,
  getTvRevealDelay,
  TV_TRANSITION_TIMING,
  type TvPhase,
} from "./tvTransition";

void test("a movie change passes through analog tuning before the new picture appears", () => {
  let phase: TvPhase = "playing";

  phase = advanceTvPhase(phase, "movieChanged");
  assert.equal(phase, "poweringOff");

  phase = advanceTvPhase(phase, "powerOffFinished");
  assert.equal(phase, "tuning");

  phase = advanceTvPhase(phase, "signalReady");
  assert.equal(phase, "poweringOn");

  phase = advanceTvPhase(phase, "powerOnFinished");
  assert.equal(phase, "playing");
});

void test("the tuning window masks YouTube controls before revealing the leader", () => {
  assert.equal(TV_TRANSITION_TIMING.youtubeSignalHoldMs, 4_000);
  assert.ok(
    TV_TRANSITION_TIMING.posterSignalHoldMs <
      TV_TRANSITION_TIMING.youtubeSignalHoldMs,
  );
});

void test("an empty vote board leaves tuning after the same bounded intro", () => {
  assert.equal(TV_TRANSITION_TIMING.emptySignalHoldMs, 4_000);
  assert.equal(
    getTvRevealDelay(null, "emptyReady"),
    TV_TRANSITION_TIMING.emptySignalHoldMs,
  );
});

void test("irrelevant phase events do not skip the signal transition", () => {
  assert.equal(advanceTvPhase("poweringOff", "signalReady"), "poweringOff");
  assert.equal(advanceTvPhase("tuning", "powerOnFinished"), "tuning");
});

void test("the same trailer can be remounted after a rapid A to B to A switch", () => {
  assert.notEqual(
    buildTvPlayerKey("trailer-a", 1),
    buildTvPlayerKey("trailer-a", 2),
  );
});

void test("a blocked YouTube player falls back to the poster instead of tuning forever", () => {
  assert.equal(TV_TRANSITION_TIMING.blockedTrailerFallbackMs, 4_000);
  assert.equal(getTvRevealDelay("trailer-a", "playerFallback"), null);
  assert.equal(
    getTvRevealDelay("trailer-a", "youtubePlaying"),
    TV_TRANSITION_TIMING.youtubeSignalHoldMs,
  );
});

void test("a film without a trailer can still reveal its poster", () => {
  assert.equal(
    getTvRevealDelay(null, "posterReady"),
    TV_TRANSITION_TIMING.posterSignalHoldMs,
  );
});
