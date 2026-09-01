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
  const match = new RegExp(
    `${escapedSelector}\\s*\\{([^}]*)\\}`,
    "s",
  ).exec(stylesheet);
  assert.ok(match, `Fant ikke CSS-regelen ${selector}`);
  return match[1] ?? "";
};

void test("keeps the TV static frame and grain at one stable size", () => {
  assert.doesNotMatch(getRuleBody(".nextTvStatic"), /animation\s*:/);
  assert.doesNotMatch(getRuleBody(".nextTvStaticGrain"), /animation\s*:/);
  assert.match(getRuleBody(".nextTvStaticGrain"), /max-width\s*:\s*none/);
  assert.doesNotMatch(stylesheet, /@keyframes\s+tvStatic(?:Arrival|Grain)\b/);
});

void test("zooms mobile trailers beyond the square cover crop", () => {
  const videoRules = [
    ...stylesheet.matchAll(/\.nextTvVideo\s*\{([^}]*)\}/gs),
  ].map((match) => match[1] ?? "");

  assert.ok(
    videoRules.some((rule) => /transform\s*:\s*scale\(1\.14\)/.test(rule)),
  );
});

void test("keeps the cassette grid free of a visible top divider", () => {
  assert.doesNotMatch(
    stylesheet,
    /\.voteWallSection\s*\{[^}]*border-top\s*:/s,
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
