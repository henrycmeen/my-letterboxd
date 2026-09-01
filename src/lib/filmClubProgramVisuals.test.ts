import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesheet = await readFile(
  new URL("../styles/filmClubProgram.module.css", import.meta.url),
  "utf8",
);
const nextFilmTvSource = await readFile(
  new URL("../components/NextFilmTv.tsx", import.meta.url),
  "utf8",
);

const getRuleBody = (selector: string): string => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "s").exec(
    stylesheet,
  );
  assert.ok(match, `Fant ikke CSS-regelen ${selector}`);
  return match[1] ?? "";
};

void test("keeps the TV static frame and grain at one stable size", () => {
  assert.doesNotMatch(getRuleBody(".nextTvStatic"), /animation\s*:/);
  assert.doesNotMatch(getRuleBody(".nextTvStaticGrain"), /animation\s*:/);
  assert.match(getRuleBody(".nextTvStaticGrain"), /max-width\s*:\s*none/);
  assert.doesNotMatch(stylesheet, /@keyframes\s+tvStatic(?:Arrival|Grain)\b/);
});

void test("keeps the TV square and capped at the mobile presentation size", () => {
  assert.match(getRuleBody(".nextCase"), /max-width\s*:\s*34rem/);
  assert.match(getRuleBody(".nextTv"), /aspect-ratio\s*:\s*1(?:\s*\/\s*1)?/);
});

void test("lets the cassette wall keep filling wide screens", () => {
  assert.doesNotMatch(getRuleBody(".voteWallSection"), /max-width\s*:/);
  assert.match(
    getRuleBody(".voteGrid"),
    /grid-template-columns\s*:\s*repeat\(auto-fill,\s*minmax\(6rem,\s*1fr\)\)/,
  );
});

void test("zooms trailers to fill the square TV at every width", () => {
  const videoRule = [
    ...stylesheet.matchAll(/\.nextTvVideo\s*\{([^}]*)\}/gs),
  ]
    .map((match) => match[1] ?? "")
    .find((rule) => /max-width\s*:\s*none/.test(rule));
  assert.ok(videoRule, "Fant ikke hovedregelen for trailervideoen");
  assert.match(videoRule, /left\s*:\s*-38\.89%/);
  assert.match(videoRule, /transform\s*:\s*scale\(1\.14\)/);
  assert.match(videoRule, /width\s*:\s*177\.78%/);
});

void test("opens the static from a bright CRT line before revealing the trailer", () => {
  assert.match(
    getRuleBody(".nextTvStaticPoweringOn"),
    /animation\s*:\s*nextTvPowerOn 420ms/,
  );
  assert.doesNotMatch(getRuleBody(".nextTvPicturePoweringOn"), /animation\s*:/);
  assert.match(
    getRuleBody(".nextTvPowerOnFlash"),
    /animation\s*:\s*nextTvPowerFlash 420ms/,
  );
  assert.match(
    stylesheet,
    /@keyframes\s+nextTvPowerOn\s*\{[\s\S]*?scaleX\(0\.08\)\s+scaleY\(0\.008\)[\s\S]*?scaleX\(1\)\s+scaleY\(1\)/,
  );
  assert.match(
    stylesheet,
    /@keyframes\s+nextTvPowerFlash\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?opacity:\s*0;/,
  );
});

void test("keeps the cassette grid free of a visible top divider", () => {
  assert.doesNotMatch(stylesheet, /\.voteWallSection\s*\{[^}]*border-top\s*:/s);
});

void test("keeps dark VHS covers legible against the black mobile wall", () => {
  assert.match(
    getRuleBody(".voteCaseCover img"),
    /filter\s*:\s*drop-shadow\(0 0 0\.035rem rgba\(255, 255, 255, 0\.18\)\)/,
  );
});

void test("retries blocked autoplay without rendering a manual trailer button", () => {
  assert.doesNotMatch(nextFilmTvSource, /Spill trailer|nextTvRetry/);
  assert.doesNotMatch(stylesheet, /\.nextTvRetry\b/);
  assert.match(
    nextFilmTvSource,
    /setTimeout\(\s*retryTrailerPlayback,\s*TV_TRANSITION_TIMING\.posterRetryMs,?\s*\)/s,
  );
});
