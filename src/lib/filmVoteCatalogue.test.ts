import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import filmVoteCatalogue from "@/data/filmVoteCatalogue.json";

const CURATED_BASE_SIZE = 92;
const CURATED_BASE_DIGEST =
  "5a35433eba0d8b989cef05ce5fe355fa9700e14082c5cebe8ddead779838804b";
const WATCHLIST_ADDITION_IDS = [
  404, 379, 11524, 10843, 44012, 8214, 8051, 614, 483, 567, 3782, 12477, 299269,
  62385, 1221061,
] as const;
const REMOVED_IDS = [421, 8392, 81, 120467, 218, 5548, 679, 258480] as const;

void test("keeps the retained curated catalogue unchanged", () => {
  const digest = createHash("sha256")
    .update(JSON.stringify(filmVoteCatalogue.slice(0, CURATED_BASE_SIZE)))
    .digest("hex");

  assert.equal(digest, CURATED_BASE_DIGEST);
});

void test("appends the curated pre-2026 watchlist films after the original catalogue", () => {
  assert.deepEqual(
    filmVoteCatalogue
      .slice(
        CURATED_BASE_SIZE,
        CURATED_BASE_SIZE + WATCHLIST_ADDITION_IDS.length,
      )
      .map(({ id }) => id),
    WATCHLIST_ADDITION_IDS,
  );
});

void test("removes films retired from the vote wall", () => {
  const ids = new Set(filmVoteCatalogue.map(({ id }) => id));

  for (const filmId of REMOVED_IDS) {
    assert.equal(ids.has(filmId), false, `Film ${filmId} should be removed`);
  }
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
