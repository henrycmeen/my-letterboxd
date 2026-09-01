import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const resultsSource = await readFile(
  new URL("../components/FilmClubResults.tsx", import.meta.url),
  "utf8",
);
const stylesheet = await readFile(
  new URL("../styles/filmClubResults.module.css", import.meta.url),
  "utf8",
);

void test("starts with the useful voting stats instead of a decorative results hero", () => {
  assert.doesNotMatch(resultsSource, /<LeaderPanel\s+results=/);
  assert.doesNotMatch(resultsSource, /className=\{styles\.resultsHeader\}/);
  assert.doesNotMatch(resultsSource, /className=\{styles\.generatedAt\}/);
  assert.match(resultsSource, /<ResultStats\s+results=\{results\}\s*\/>/);
});

void test("keeps the ranking title without the redundant all-films label", () => {
  assert.doesNotMatch(resultsSource, />Alle filmer</);
  assert.match(resultsSource, /<h2 id="ranking-heading">Rangering<\/h2>/);
});

void test("keeps the winner history without the redundant archive label", () => {
  assert.doesNotMatch(resultsSource, />Arkiv<\/p>/);
  assert.match(resultsSource, />Tidligere vinnere<\/h2>/);
});

void test("uses the restrained red cyan and cream results palette", () => {
  assert.match(stylesheet, /--results-red\s*:/);
  assert.match(stylesheet, /--results-cyan\s*:/);
  assert.match(stylesheet, /--results-cream\s*:/);
  assert.match(stylesheet, /--results-accent\s*:\s*var\(--results-red\)/);
});

void test("shows the same TMDB score used to break vote ties", () => {
  assert.match(
    resultsSource,
    /TMDB\s*\{formatTmdbScore\(entry\.tmdbVoteAverage\)\}/,
  );
});
