import assert from "node:assert/strict";
import test from "node:test";
import { applyFilmVote, applyRankedFilmVote, rankFilmVotes } from "./filmPoll";

void test("adds the first vote to the selected film", () => {
  const result = applyFilmVote(
    [
      { id: "parasite", votes: 12 },
      { id: "aftersun", votes: 9 },
    ],
    null,
    "aftersun",
  );

  assert.deepEqual(result, [
    { id: "parasite", votes: 12 },
    { id: "aftersun", votes: 10 },
  ]);
});

void test("moves an existing vote when the selection changes", () => {
  const result = applyFilmVote(
    [
      { id: "parasite", votes: 13 },
      { id: "aftersun", votes: 9 },
    ],
    "parasite",
    "aftersun",
  );

  assert.deepEqual(result, [
    { id: "parasite", votes: 12 },
    { id: "aftersun", votes: 10 },
  ]);
});

void test("does not double count an unchanged vote", () => {
  const votes = [
    { id: "parasite", votes: 13 },
    { id: "aftersun", votes: 9 },
  ];

  assert.deepEqual(applyFilmVote(votes, "parasite", "parasite"), votes);
});

void test("ranks the film with the most votes first", () => {
  const result = rankFilmVotes([
    { id: "stalker", votes: 2, initialRank: 0, lastVoteOrder: 0 },
    { id: "persona", votes: 5, initialRank: 1, lastVoteOrder: 0 },
  ]);

  assert.deepEqual(
    result.map(({ id }) => id),
    ["persona", "stalker"],
  );
});

void test("moves a newly voted film ahead of tied films", () => {
  const result = applyRankedFilmVote(
    [
      { id: "stalker", votes: 0, initialRank: 0, lastVoteOrder: 0 },
      { id: "persona", votes: 0, initialRank: 1, lastVoteOrder: 0 },
    ],
    null,
    "persona",
    1,
  );

  assert.deepEqual(result[0], {
    id: "persona",
    votes: 1,
    initialRank: 1,
    lastVoteOrder: 1,
  });
});

void test("changing vote removes the previous vote before reranking", () => {
  const result = applyRankedFilmVote(
    [
      { id: "stalker", votes: 1, initialRank: 0, lastVoteOrder: 1 },
      { id: "persona", votes: 0, initialRank: 1, lastVoteOrder: 0 },
    ],
    "stalker",
    "persona",
    2,
  );

  assert.deepEqual(result, [
    { id: "persona", votes: 1, initialRank: 1, lastVoteOrder: 2 },
    { id: "stalker", votes: 0, initialRank: 0, lastVoteOrder: 1 },
  ]);
});
