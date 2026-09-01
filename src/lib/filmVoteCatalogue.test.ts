import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import filmVoteCatalogue from "@/data/filmVoteCatalogue.json";

const ORIGINAL_CATALOGUE_SIZE = 100;
const ORIGINAL_CATALOGUE_DIGEST =
  "233328aa5e10d7597ce37883920257aba8e5ce3b8861a2321822e96cfa140e98";
const WATCHLIST_ADDITION_IDS = [
  404, 379, 11524, 10843, 44012, 8214, 8051, 614, 483, 567, 3782, 12477,
] as const;

void test("keeps the original curated catalogue unchanged", () => {
  const digest = createHash("sha256")
    .update(JSON.stringify(filmVoteCatalogue.slice(0, ORIGINAL_CATALOGUE_SIZE)))
    .digest("hex");

  assert.equal(digest, ORIGINAL_CATALOGUE_DIGEST);
});

void test("appends the curated pre-2026 watchlist films after the original catalogue", () => {
  assert.deepEqual(
    filmVoteCatalogue
      .slice(
        ORIGINAL_CATALOGUE_SIZE,
        ORIGINAL_CATALOGUE_SIZE + WATCHLIST_ADDITION_IDS.length,
      )
      .map(({ id }) => id),
    WATCHLIST_ADDITION_IDS,
  );
});

void test("keeps every vote film uniquely identified and fully playable", () => {
  const ids = filmVoteCatalogue.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);

  const additions = WATCHLIST_ADDITION_IDS.map((filmId) => {
    const film = filmVoteCatalogue.find(({ id }) => id === filmId);
    assert.ok(film, `Missing watchlist film ${filmId}`);
    return film;
  });

  for (const film of additions) {
    assert.ok(film.year < 2026, `${film.title} must predate 2026`);
    assert.match(film.trailerYoutubeId, /^[A-Za-z0-9_-]{6,}$/);
    assert.ok(
      existsSync(
        path.join(process.cwd(), "public", film.coverImage.replace(/^\//, "")),
      ),
      `Missing rendered VHS cover for ${film.title}`,
    );
  }
});
