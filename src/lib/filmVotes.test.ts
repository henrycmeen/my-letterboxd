import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { Worker } from "node:worker_threads";
import { createFilmVoteStore } from "./filmVotes";

const testDirectories: string[] = [];

const createStore = async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "filmklubb-votes-"));
  testDirectories.push(directory);
  return createFilmVoteStore(path.join(directory, "votes.sqlite"));
};

afterEach(async () => {
  await Promise.all(
    testDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { force: true, recursive: true })),
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

void test("removes a voter's vote without touching other voters", async () => {
  const store = await createStore();

  store.setVote("na", 42, "voter-a", true);
  store.setVote("na", 42, "voter-b", true);
  store.setVote("na", 42, "voter-a", false);

  const firstVoter = store.getSnapshot("na", "voter-a", [42, 7]);
  const secondVoter = store.getSnapshot("na", "voter-b", [42, 7]);
  assert.equal(firstVoter.revision, 3);
  assert.deepEqual(firstVoter.ranking, [
    { filmId: 42, votes: 1 },
    { filmId: 7, votes: 0 },
  ]);
  assert.deepEqual(firstVoter.votedFilmIds, []);
  assert.deepEqual(secondVoter.votedFilmIds, [42]);
});

void test("setting the same vote state twice is idempotent", async () => {
  const store = await createStore();

  assert.equal(store.setVote("na", 42, "voter-a", true), true);
  assert.equal(store.setVote("na", 42, "voter-a", true), false);
  assert.equal(store.setVote("na", 42, "voter-a", false), true);
  assert.equal(store.setVote("na", 42, "voter-a", false), false);

  const snapshot = store.getSnapshot("na", "voter-a", [42, 7]);
  assert.equal(snapshot.revision, 2);
  assert.deepEqual(snapshot.votedFilmIds, []);
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

void test("reads each device vote and shared ranking from one SQLite snapshot", async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "filmklubb-votes-"));
  testDirectories.push(directory);
  const databasePath = path.join(directory, "votes.sqlite");
  const store = createFilmVoteStore(databasePath);
  const stopBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const stop = new Int32Array(stopBuffer);
  const writer = new Worker(
    `
      const { DatabaseSync } = require("node:sqlite");
      const { parentPort, workerData } = require("node:worker_threads");
      const database = new DatabaseSync(workerData.databasePath);
      database.exec("PRAGMA journal_mode = WAL");
      database.exec("PRAGMA busy_timeout = 5000");
      const insertVote = database.prepare(
        "INSERT OR IGNORE INTO film_votes (board_id, film_id, voter_key, created_at) VALUES (?, ?, ?, ?)",
      );
      const deleteVote = database.prepare(
        "DELETE FROM film_votes WHERE board_id = ? AND film_id = ? AND voter_key = ?",
      );
      const updateRevision = database.prepare(
        "INSERT INTO film_vote_boards (board_id, revision, updated_at) VALUES (?, 1, ?) " +
          "ON CONFLICT(board_id) DO UPDATE SET revision = film_vote_boards.revision + 1, updated_at = excluded.updated_at",
      );
      const stop = new Int32Array(workerData.stopBuffer);
      let hasVoted = false;
      parentPort.postMessage("ready");
      while (Atomics.load(stop, 0) === 0) {
        database.exec("BEGIN IMMEDIATE");
        const updatedAt = new Date().toISOString();
        const result = hasVoted
          ? deleteVote.run("na", 42, "voter-a")
          : insertVote.run("na", 42, "voter-a", updatedAt);
        if (result.changes > 0) {
          updateRevision.run("na", updatedAt);
        }
        database.exec("COMMIT");
        hasVoted = !hasVoted;
      }
      database.close();
    `,
    {
      eval: true,
      workerData: { databasePath, stopBuffer },
    },
  );

  await new Promise<void>((resolve, reject) => {
    writer.once("message", () => resolve());
    writer.once("error", reject);
  });

  let inconsistentSnapshot: ReturnType<typeof store.getSnapshot> | null = null;
  try {
    for (let index = 0; index < 25_000; index += 1) {
      const snapshot = store.getSnapshot("na", "voter-a", [42]);
      if (snapshot.ranking[0]?.votes !== snapshot.votedFilmIds.length) {
        inconsistentSnapshot = snapshot;
        break;
      }
    }
  } finally {
    Atomics.store(stop, 0, 1);
    await writer.terminate();
    store.close();
  }

  assert.equal(inconsistentSnapshot, null);
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

void test("keeps the earlier film ahead when vote totals are tied", async () => {
  const store = await createStore();

  store.recordVote("na", 42, "voter-a");
  store.recordVote("na", 7, "voter-a");

  const snapshot = store.getSnapshot("na", "voter-a", [42, 7, 3]);
  assert.deepEqual(snapshot.ranking, [
    { filmId: 42, votes: 1 },
    { filmId: 7, votes: 1 },
    { filmId: 3, votes: 0 },
  ]);
});

void test("keeps the catalogue order before anyone has voted", async () => {
  const store = await createStore();

  const snapshot = store.getSnapshot("na", "voter-a", [42, 7, 3]);

  assert.deepEqual(snapshot.ranking, [
    { filmId: 42, votes: 0 },
    { filmId: 7, votes: 0 },
    { filmId: 3, votes: 0 },
  ]);
});

void test("always ranks more votes ahead of catalogue order", async () => {
  const store = await createStore();

  store.recordVote("na", 42, "voter-a");

  const snapshot = store.getSnapshot("na", "voter-a", [7, 42]);
  assert.deepEqual(snapshot.ranking, [
    { filmId: 42, votes: 1 },
    { filmId: 7, votes: 0 },
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

void test("reports aggregate participation without exposing voter keys", async () => {
  const store = await createStore();

  store.recordVote("na-round", 7, "device-v1:voter-a");
  store.recordVote("na-round", 42, "device-v1:voter-a");
  store.recordVote("na-round", 7, "device-v1:voter-b");

  const results = store.getResults("na-round", [42, 7, 3]);
  assert.equal(results.boardId, "na-round");
  assert.equal(results.revision, 3);
  assert.equal(results.totalVotes, 3);
  assert.equal(results.participatingDevices, 2);
  assert.match(results.lastVoteAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(results.ranking, [
    { filmId: 7, votes: 2 },
    { filmId: 42, votes: 1 },
    { filmId: 3, votes: 0 },
  ]);
  assert.equal(JSON.stringify(results).includes("voter-a"), false);
});

void test("reports an empty aggregate for a fresh screening", async () => {
  const store = await createStore();

  const results = store.getResults("fresh-round", [42, 7]);
  assert.equal(results.revision, 0);
  assert.equal(results.totalVotes, 0);
  assert.equal(results.participatingDevices, 0);
  assert.equal(results.lastVoteAt, null);
});
