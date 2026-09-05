import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { Worker } from "node:worker_threads";
import {
  FilmRoundClosedError,
  FilmRoundRevisionConflictError,
  type FilmRoundLockMetadata,
} from "./filmRound";
import { createFilmVoteStore } from "./filmVotes";

const testDirectories: string[] = [];

const createStore = async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "filmklubb-votes-"));
  testDirectories.push(directory);
  return createFilmVoteStore(path.join(directory, "votes.sqlite"));
};

const createRoundMetadata = (
  clubId = "default",
  screeningId = "2026-09-22",
): FilmRoundLockMetadata => {
  const films = [
    {
      id: 10,
      title: "Ten",
      year: 2000,
      coverImage: "/ten.webp",
      tmdbVoteAverage: 7.2,
    },
    {
      id: 20,
      title: "Twenty",
      year: 2001,
      coverImage: "/twenty.webp",
      tmdbVoteAverage: 8.4,
    },
    {
      id: 30,
      title: "Thirty",
      year: 2002,
      coverImage: "/thirty.webp",
      tmdbVoteAverage: 9.1,
    },
  ];
  const ticketTemplates = Object.fromEntries(
    films.map((film, index) => [
      String(film.id),
      {
        film: {
          id: film.id,
          title: film.title,
          year: film.year,
          coverImage: film.coverImage,
        },
        image: `/image-${film.id}.jpg`,
        fallback: `/fallback-${film.id}.jpg`,
        palette: "ember",
        date: "2026-09-22",
        time: "16:00",
        venue: "Wergelandssalen",
        note: "ADGANG FOR ÉN",
        serial: String(index + 1).padStart(3, "0"),
      },
    ]),
  );

  return {
    clubId,
    screeningId,
    scheduledAt: "2026-09-22T16:00:00+02:00",
    catalogue: films,
    ticketTemplates,
  };
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
  let workerReady = false;
  let workerError: Error | null = null;
  let exitCode: number | null = null;
  let inconsistentSnapshot: ReturnType<typeof store.getSnapshot> | null = null;
  writer.on("error", (error: Error) => {
    workerError = error;
  });
  const exitPromise = new Promise<number>((resolve) => {
    writer.once("exit", resolve);
  });
  const readyPromise = new Promise<void>((resolve, reject) => {
    writer.once("message", (message) => {
      if (message !== "ready") {
        reject(new Error(`Unexpected writer message: ${String(message)}`));
        return;
      }
      workerReady = true;
      resolve();
    });
    writer.once("error", reject);
    writer.once("exit", (code) => {
      if (!workerReady) {
        reject(new Error(`Writer exited before ready with code ${code}`));
      }
    });
  });

  try {
    await readyPromise;
    for (let index = 0; index < 25_000; index += 1) {
      const snapshot = store.getSnapshot("na", "voter-a", [42]);
      const expectedVoteState = snapshot.revision % 2;
      if (
        snapshot.ranking[0]?.votes !== expectedVoteState ||
        snapshot.votedFilmIds.length !== expectedVoteState
      ) {
        inconsistentSnapshot = snapshot;
        break;
      }
    }
  } finally {
    Atomics.store(stop, 0, 1);
    exitCode = await new Promise<number | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 5_000);
      void exitPromise.then((code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });
    if (exitCode === null) {
      await writer.terminate();
    }
    store.close();
  }

  assert.equal(workerError, null);
  assert.equal(exitCode, 0);
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

void test("ranks tied positive films by TMDB score", async () => {
  const store = await createStore();

  store.recordVote("na", 68722, "voter-a");
  store.recordVote("na", 25538, "voter-a");

  const snapshot = store.getSnapshot(
    "na",
    "voter-a",
    [68722, 25538, 680],
    new Map([
      [68722, 7.094],
      [25538, 7.9],
      [680, 8.48],
    ]),
  );

  assert.deepEqual(snapshot.ranking, [
    { filmId: 25538, votes: 1 },
    { filmId: 68722, votes: 1 },
    { filmId: 680, votes: 0 },
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

void test("locks a complete, tie-broken ranking and freezes the winning ticket", async () => {
  const store = await createStore();
  const metadata = createRoundMetadata();

  store.recordVote("default-2026-09-22", 10, "voter-a");
  store.recordVote("default-2026-09-22", 20, "voter-b");

  const snapshot = store.lockRound("default-2026-09-22", metadata, 2);

  assert.deepEqual(
    snapshot.ranking.map(({ film, votes }) => ({ filmId: film.id, votes })),
    [
      { filmId: 20, votes: 1 },
      { filmId: 10, votes: 1 },
      { filmId: 30, votes: 0 },
    ],
  );
  assert.equal(snapshot.winner?.film.id, 20);
  assert.equal(snapshot.stats.totalVotes, 2);
  assert.equal(snapshot.stats.participatingDevices, 2);
  assert.equal(snapshot.revision, 2);
  assert.equal(snapshot.algorithmVersion, "film-vote-v1");
  assert.equal(snapshot.ticket?.film.id, 20);
  assert.equal(snapshot.ranking[0]?.tmdbVoteAverage, 8.4);
  assert.equal(snapshot.snapshotHash.length, 64);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.ranking), true);
  assert.deepEqual(store.getRoundSnapshot("default-2026-09-22"), snapshot);
  assert.deepEqual(store.getLockedRound("default-2026-09-22"), snapshot);
});

void test("returns the original snapshot for an idempotent relock", async () => {
  const store = await createStore();
  const metadata = createRoundMetadata();

  store.recordVote("default-2026-09-22", 10, "voter-a");
  const first = store.lockRound("default-2026-09-22", metadata, 1);
  const second = store.lockRound("default-2026-09-22", metadata, 999);

  assert.equal(second.snapshotId, first.snapshotId);
  assert.equal(second.snapshotHash, first.snapshotHash);
  assert.deepEqual(second, first);
});

void test("validates the round metadata before an idempotent relock", async () => {
  const store = await createStore();
  const first = store.lockRound("default-2026-09-22", createRoundMetadata(), 0);

  assert.throws(
    () =>
      store.lockRound(
        "default-2026-09-22",
        createRoundMetadata("other-club"),
        999,
      ),
    /board must match the round club and screening/i,
  );
  assert.deepEqual(store.getLockedRound("default-2026-09-22"), first);
});

void test("rejects a stale expected revision before creating a snapshot", async () => {
  const store = await createStore();
  const metadata = createRoundMetadata();

  store.recordVote("default-2026-09-22", 10, "voter-a");

  assert.throws(
    () => store.lockRound("default-2026-09-22", metadata, 0),
    (error: unknown) =>
      error instanceof FilmRoundRevisionConflictError &&
      error.code === "REVISION_CONFLICT" &&
      error.expectedRevision === 0 &&
      error.actualRevision === 1,
  );
  assert.equal(store.getRoundSnapshot("default-2026-09-22"), null);
});

void test("rejects a board that does not match the round metadata", async () => {
  const store = await createStore();

  assert.throws(
    () => store.lockRound("other-board", createRoundMetadata(), 0),
    /board must match the round club and screening/i,
  );
});

void test("refuses to lock votes for films outside the frozen catalogue", async () => {
  const store = await createStore();
  store.recordVote("default-2026-09-22", 999, "voter-a");

  assert.throws(
    () => store.lockRound("default-2026-09-22", createRoundMetadata(), 1),
    /outside its catalogue/i,
  );
  assert.equal(store.getRoundSnapshot("default-2026-09-22"), null);
});

void test("refuses to lock a positive winner without a matching ticket", async () => {
  const store = await createStore();
  const metadata = createRoundMetadata();
  delete metadata.ticketTemplates["10"];
  store.recordVote("default-2026-09-22", 10, "voter-a");

  assert.throws(
    () => store.lockRound("default-2026-09-22", metadata, 1),
    /winning film is missing its ticket template/i,
  );
  assert.equal(store.getRoundSnapshot("default-2026-09-22"), null);
});

void test("locks an empty round without inventing a winner or ticket", async () => {
  const store = await createStore();
  const snapshot = store.lockRound(
    "default-2026-09-22",
    createRoundMetadata(),
    0,
  );

  assert.equal(snapshot.winner, null);
  assert.equal(snapshot.ticket, null);
  assert.equal(snapshot.stats.totalVotes, 0);
  assert.equal(snapshot.stats.participatingDevices, 0);
  assert.deepEqual(
    snapshot.ranking.map(({ film, votes }) => ({ filmId: film.id, votes })),
    [
      { filmId: 10, votes: 0 },
      { filmId: 20, votes: 0 },
      { filmId: 30, votes: 0 },
    ],
  );
});

void test("rejects both new and removal votes after a round is closed", async () => {
  const store = await createStore();
  store.recordVote("default-2026-09-22", 10, "voter-a");
  store.lockRound("default-2026-09-22", createRoundMetadata(), 1);

  for (const hasVoted of [true, false]) {
    assert.throws(
      () => store.setVote("default-2026-09-22", 10, "voter-a", hasVoted),
      (error: unknown) =>
        error instanceof FilmRoundClosedError && error.code === "ROUND_CLOSED",
    );
  }
});

void test("keeps closed and open boards independent", async () => {
  const store = await createStore();
  store.lockRound("closed-2026-09-22", createRoundMetadata("closed"), 0);

  assert.equal(store.getRoundSnapshot("open-2026-09-22"), null);
  assert.equal(store.recordVote("open-2026-09-22", 10, "voter-a"), true);
  assert.equal(
    store.getSnapshot("open-2026-09-22", "voter-a", [10]).ranking[0]?.votes,
    1,
  );
});
