import assert from "node:assert/strict";
import test from "node:test";
import {
  areVoteSnapshotsEqual,
  getFlipMotion,
  getPublishedVoteLeaderId,
  getVoteCaseState,
  getVoteToggleInteraction,
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
  const current = {
    boardId: "na",
    ranking: [
      { filmId: 20, votes: 4 },
      { filmId: 10, votes: 2 },
      { filmId: 30, votes: 0 },
    ],
    revision: 7,
    votedFilmIds: [20],
  };

  assert.equal(
    shouldApplyVoteSnapshot("na", current, { ...current, revision: 6 }),
    false,
  );
  assert.equal(shouldApplyVoteSnapshot("na", current, current), true);
  assert.equal(
    shouldApplyVoteSnapshot("na", current, { ...current, revision: 8 }),
    true,
  );
});

void test("rejects wrong-board and conflicting same-revision snapshots", () => {
  const current = {
    boardId: "na",
    ranking: [
      { filmId: 20, votes: 4 },
      { filmId: 10, votes: 2 },
      { filmId: 30, votes: 0 },
    ],
    revision: 7,
    votedFilmIds: [20],
  };

  assert.equal(
    shouldApplyVoteSnapshot("na", current, {
      ...current,
      boardId: "another-club",
      revision: 99,
    }),
    false,
  );
  assert.equal(
    shouldApplyVoteSnapshot("na", current, {
      ...current,
      ranking: [
        { filmId: 10, votes: 4 },
        { filmId: 20, votes: 2 },
        { filmId: 30, votes: 0 },
      ],
    }),
    false,
  );
});

void test("publishes no leader until the first authoritative snapshot", () => {
  const snapshot = {
    boardId: "na",
    ranking: [
      { filmId: 20, votes: 4 },
      { filmId: 10, votes: 2 },
      { filmId: 30, votes: 0 },
    ],
    revision: 7,
    votedFilmIds: [20],
  };

  assert.equal(getPublishedVoteLeaderId(snapshot, false), null);
  assert.equal(getPublishedVoteLeaderId(snapshot, true), 20);
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

void test("keeps unvoted cases closed and opens the films this voter supported", () => {
  assert.deepEqual(getVoteCaseState({ hasVoted: false, isLeader: false }), {
    isOpen: false,
    showsCassette: true,
  });
  assert.deepEqual(getVoteCaseState({ hasVoted: true, isLeader: false }), {
    isOpen: true,
    showsCassette: true,
  });
});

void test("keeps the leader case empty without changing its voted open state", () => {
  assert.deepEqual(getVoteCaseState({ hasVoted: false, isLeader: true }), {
    isOpen: false,
    showsCassette: false,
  });
  assert.deepEqual(getVoteCaseState({ hasVoted: true, isLeader: true }), {
    isOpen: true,
    showsCassette: false,
  });
});

void test("closes a removed vote immediately without a sticky hover preview", () => {
  assert.deepEqual(getVoteToggleInteraction(true), {
    nextHasVoted: false,
    suppressPreview: true,
  });
  assert.deepEqual(getVoteToggleInteraction(false), {
    nextHasVoted: true,
    suppressPreview: false,
  });
});
