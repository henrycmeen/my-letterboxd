import assert from "node:assert/strict";
import test from "node:test";
import { selectTmdbYoutubeTrailer } from "@/lib/tmdb";

void test("prefers an official YouTube trailer", () => {
  const selected = selectTmdbYoutubeTrailer([
    { key: "teaser", site: "YouTube", type: "Teaser", official: true },
    { key: "fan", site: "YouTube", type: "Trailer", official: false },
    { key: "official", site: "YouTube", type: "Trailer", official: true },
  ]);

  assert.equal(selected, "official");
});

void test("ignores non-YouTube videos", () => {
  const selected = selectTmdbYoutubeTrailer([
    { key: "vimeo", site: "Vimeo", type: "Trailer", official: true },
    { key: "youtube", site: "YouTube", type: "Trailer", official: false },
  ]);

  assert.equal(selected, "youtube");
});
