import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  FALLBACK_NEXT_MOVIE,
  formatFilmDate,
} from "@/components/filmClubProgramData";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

void test("always renders the screening time in Oslo", () => {
  process.env.TZ = "UTC";

  assert.equal(
    formatFilmDate("2026-09-22T16:00:00+02:00"),
    "tirsdag 22. september kl. 16:00",
  );
});

void test("uses the new screening time for the offline fallback movie", () => {
  assert.equal(FALLBACK_NEXT_MOVIE.scheduledAt, "2026-09-22T16:00:00+02:00");
});
