import assert from "node:assert/strict";
import test from "node:test";
import {
  areVoteSnapshotsEqual,
  getFlipMotion,
  parseFilmVoteSnapshot,
  shouldApplyVoteSnapshot,
} from "./filmVoteClient";

const allowedFilmIds = new Set([10, 20, 30]);

void test("accepts a complete vote snapshot for the requested club", () => {
  const snapshot = parseFilmVoteSnapshot(
    {
      boardId: "na",
      ranking: [
        { filmId: 20, votes: 4 },
        { filmId: 10, votes: 2 },
        { filmId: 30, votes: 0 },
      ],
      revision: 6,
      votedFilmIds: [20, 30],
    },
    "na",
    allowedFilmIds,
  );

  assert.equal(snapshot?.revision, 6);
  assert.equal(snapshot?.ranking[0]?.filmId, 20);
});

void test("rejects snapshots with missing, duplicate, or unknown films", () => {
  const invalidRankings = [
    [
      { filmId: 10, votes: 1 },
      { filmId: 20, votes: 0 },
    ],
    [
      { filmId: 10, votes: 1 },
      { filmId: 10, votes: 0 },
      { filmId: 30, votes: 0 },
    ],
    [
      { filmId: 10, votes: 1 },
      { filmId: 20, votes: 0 },
      { filmId: 999, votes: 0 },
    ],
  ];

  for (const ranking of invalidRankings) {
    assert.equal(
      parseFilmVoteSnapshot(
        {
          boardId: "na",
          ranking,
          revision: 1,
          votedFilmIds: [],
        },
        "na",
        allowedFilmIds,
      ),
      null,
    );
  }
});

void test("rejects stale snapshots so late requests cannot undo a newer rank", () => {
  assert.equal(shouldApplyVoteSnapshot(7, 6), false);
  assert.equal(shouldApplyVoteSnapshot(7, 7), true);
  assert.equal(shouldApplyVoteSnapshot(7, 8), true);
});

void test("recognizes an unchanged poll response without restarting motion", () => {
  const first = {
    boardId: "na",
    ranking: [
      { filmId: 20, votes: 4 },
      { filmId: 10, votes: 2 },
      { filmId: 30, votes: 0 },
    ],
    revision: 6,
    votedFilmIds: [20, 30],
  };

  assert.equal(areVoteSnapshotsEqual(first, structuredClone(first)), true);
  assert.equal(
    areVoteSnapshotsEqual(first, { ...first, votedFilmIds: [20] }),
    false,
  );
});

void test("builds a spring-like FLIP motion from the previous slot", () => {
  const motion = getFlipMotion(
    { left: 20, top: 420 },
    { left: 220, top: 40 },
    12,
  );

  assert.deepEqual(motion?.from, { x: -200, y: 380 });
  assert.equal((motion?.durationMs ?? 0) > 600, true);
  assert.equal((motion?.delayMs ?? 0) > 0, true);
});

void test("skips FLIP work when a cassette stayed in the same slot", () => {
  assert.equal(
    getFlipMotion({ left: 20, top: 40 }, { left: 20, top: 40 }, 0),
    null,
  );
});
