import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { formatFilmDate } from "@/components/filmClubProgramData";

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
    formatFilmDate("2026-09-06T19:00:00+02:00"),
    "søndag 6. september kl. 19:00",
  );
});
