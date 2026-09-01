import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildVoteCoverFileName,
  nextVoteCoverSequence,
  parseVoteCatalogueUpdateArgs,
} from "@/lib/filmVoteCatalogueUpdate";

void test("parses repeated TMDB additions and removals", () => {
  assert.deepEqual(
    parseVoteCatalogueUpdateArgs([
      "--",
      "--add",
      "299269",
      "--add=62385",
      "--remove",
      "421",
      "--remove=8392",
    ]),
    {
      addIds: [299269, 62385],
      removeIds: [421, 8392],
    },
  );
});

void test("rejects invalid, incomplete and conflicting changes", () => {
  assert.throws(
    () => parseVoteCatalogueUpdateArgs(["--add"]),
    /requires a TMDB id/,
  );
  assert.throws(
    () => parseVoteCatalogueUpdateArgs(["--remove", "nope"]),
    /positive integer/,
  );
  assert.throws(
    () => parseVoteCatalogueUpdateArgs(["--add", "42", "--remove", "42"]),
    /both added and removed/,
  );
});

void test("builds stable cover filenames after the highest used sequence", () => {
  assert.equal(
    nextVoteCoverSequence([
      "/VHS/program/vote-covers/009-alien.webp",
      "/VHS/program/vote-covers/112-grave-of-the-fireflies.webp",
    ]),
    113,
  );
  assert.equal(
    buildVoteCoverFileName(113, "The Girl Who Leapt Through Time"),
    "113-the-girl-who-leapt-through-time.webp",
  );
});
