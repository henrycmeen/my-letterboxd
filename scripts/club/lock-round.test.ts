import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLockRoundArgs } from "./lock-round";

void test("uses a safe read-only preview by default", () => {
  assert.deepEqual(parseLockRoundArgs([]), {
    clubProvided: false,
    clubSlug: "default",
    commit: false,
    help: false,
    screeningProvided: false,
  });
});

void test("parses the explicit close gate", () => {
  assert.deepEqual(
    parseLockRoundArgs([
      "--club",
      "NA",
      "--screening",
      "2026-09-22",
      "--expected-revision",
      "12",
      "--database",
      "/tmp/filmklubb.sqlite",
      "--commit",
    ]),
    {
      clubProvided: true,
      clubSlug: "na",
      commit: true,
      databasePath: "/tmp/filmklubb.sqlite",
      expectedRevision: 12,
      help: false,
      screeningId: "2026-09-22",
      screeningProvided: true,
    },
  );
});

void test("rejects unsafe or ambiguous command line input", () => {
  assert.throws(
    () => parseLockRoundArgs(["--screening", "../current"]),
    /invalid screening/i,
  );
  assert.throws(
    () => parseLockRoundArgs(["--expected-revision", "1.5"]),
    /invalid expected revision/i,
  );
  assert.throws(() => parseLockRoundArgs(["--unknown"]), /unknown option/i);
});
