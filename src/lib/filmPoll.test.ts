import assert from "node:assert/strict";
import test from "node:test";
import { applyFilmVote } from "./filmPoll";

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
