import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { createFilmVoteStore } from "./filmVotes";

const testDirectories: string[] = [];

const createStore = async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "filmklubb-votes-"));
  testDirectories.push(directory);
  return createFilmVoteStore(path.join(directory, "votes.sqlite"));
};

afterEach(async () => {
  await Promise.all(
    testDirectories.splice(0).map((directory) =>
      fs.rm(directory, { force: true, recursive: true }),
    ),
  );
});

void test("records at most one vote per film for the same voter", async () => {
  const store = await createStore();

  store.recordVote("na", 42, "voter-a");
  store.recordVote("na", 42, "voter-a");

  const snapshot = store.getSnapshot("na", "voter-a", [42, 7]);
  assert.equal(snapshot.revision, 1);
  assert.deepEqual(snapshot.ranking, [
    { filmId: 42, votes: 1 },
    { filmId: 7, votes: 0 },
  ]);
  assert.deepEqual(snapshot.votedFilmIds, [42]);
});

void test("lets one voter support several different films", async () => {
  const store = await createStore();

  store.recordVote("na", 42, "voter-a");
  store.recordVote("na", 7, "voter-a");

  const snapshot = store.getSnapshot("na", "voter-a", [42, 7, 3]);
  assert.equal(snapshot.revision, 2);
  assert.deepEqual(snapshot.ranking, [
    { filmId: 42, votes: 1 },
    { filmId: 7, votes: 1 },
    { filmId: 3, votes: 0 },
  ]);
  assert.deepEqual(snapshot.votedFilmIds, [42, 7]);
});

void test("counts votes from different voters for the same film", async () => {
  const store = await createStore();

  store.recordVote("na", 7, "voter-a");
  store.recordVote("na", 7, "voter-b");

  const snapshot = store.getSnapshot("na", "voter-a", [42, 7]);
  assert.deepEqual(snapshot.ranking, [
    { filmId: 7, votes: 2 },
    { filmId: 42, votes: 0 },
  ]);
});

void test("keeps the earlier leader ahead when another film only draws level", async () => {
  const store = await createStore();

  store.recordVote("na", 100, "voter-a");
  store.recordVote("na", 50, "voter-a");

  const snapshot = store.getSnapshot("na", "voter-a", [50, 100, 1]);
  assert.deepEqual(snapshot.ranking, [
    { filmId: 100, votes: 1 },
    { filmId: 50, votes: 1 },
    { filmId: 1, votes: 0 },
  ]);
});

void test("isolates votes between club boards", async () => {
  const store = await createStore();

  store.recordVote("na", 7, "voter-a");

  const otherClub = store.getSnapshot("default", "voter-a", [7]);
  assert.equal(otherClub.revision, 0);
  assert.deepEqual(otherClub.ranking, [{ filmId: 7, votes: 0 }]);
  assert.deepEqual(otherClub.votedFilmIds, []);
});
