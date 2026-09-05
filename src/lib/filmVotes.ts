import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { CLUB_SQLITE_PATH } from "@/lib/storagePaths";
import {
  FILM_ROUND_ALGORITHM_VERSION,
  FilmRoundClosedError,
  FilmRoundRevisionConflictError,
  filmRoundLockMetadataSchema,
  filmRoundSnapshotSchema,
  freezeFilmRoundSnapshot,
  type FilmRoundLockMetadata,
  type FilmRoundSnapshot,
} from "@/lib/filmRound";

export interface FilmVoteRankingEntry {
  filmId: number;
  votes: number;
}

export interface FilmVoteSnapshot {
  boardId: string;
  ranking: FilmVoteRankingEntry[];
  revision: number;
  votedFilmIds: number[];
}

export interface FilmVoteResults {
  boardId: string;
  lastVoteAt: string | null;
  participatingDevices: number;
  ranking: FilmVoteRankingEntry[];
  revision: number;
  totalVotes: number;
}

interface VoteCountRow {
  film_id: number;
  first_vote_order: number;
  votes: number;
}

interface VoteRevisionRow {
  revision: number;
}

interface VotedFilmRow {
  film_id: number;
}

interface VoteFilmIdRow {
  film_id: number;
}

interface VoteStatsRow {
  last_vote_at: string | null;
  participating_devices: number;
  total_votes: number;
}

interface FilmVoteRoundSnapshotRow {
  board_id: string;
  club_id: string;
  screening_id: string;
  scheduled_at: string;
  locked_at: string;
  snapshot_id: string;
  snapshot_hash: string;
  algorithm_version: string;
  revision: number;
  snapshot_json: string;
}

export interface FilmVoteStore {
  close(): void;
  getLockedRound(boardId: string): FilmRoundSnapshot | null;
  getRoundSnapshot(boardId: string): FilmRoundSnapshot | null;
  getSnapshot(
    boardId: string,
    voterKey: string,
    catalogueFilmIds: number[],
    tieBreakScores?: ReadonlyMap<number, number>,
  ): FilmVoteSnapshot;
  getResults(
    boardId: string,
    catalogueFilmIds: number[],
    tieBreakScores?: ReadonlyMap<number, number>,
  ): FilmVoteResults;
  lockRound(
    boardId: string,
    metadata: FilmRoundLockMetadata,
    expectedRevision: number,
  ): FilmRoundSnapshot;
  recordVote(boardId: string, filmId: number, voterKey: string): boolean;
  setVote(
    boardId: string,
    filmId: number,
    voterKey: string,
    hasVoted: boolean,
  ): boolean;
}

const initializeDatabase = (database: DatabaseSync): void => {
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS film_vote_boards (
      board_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS film_votes (
      vote_id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id TEXT NOT NULL,
      film_id INTEGER NOT NULL,
      voter_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (board_id, film_id, voter_key)
    );

    CREATE INDEX IF NOT EXISTS film_votes_board_film_idx
      ON film_votes (board_id, film_id);

    CREATE INDEX IF NOT EXISTS film_votes_board_voter_idx
      ON film_votes (board_id, voter_key);

    CREATE TABLE IF NOT EXISTS film_vote_round_snapshots (
      board_id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL,
      screening_id TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      locked_at TEXT NOT NULL,
      snapshot_id TEXT NOT NULL UNIQUE,
      snapshot_hash TEXT NOT NULL,
      algorithm_version TEXT NOT NULL,
      revision INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS film_vote_round_snapshots_screening_idx
      ON film_vote_round_snapshots (club_id, screening_id);
  `);
};

const runInTransaction = <T>(database: DatabaseSync, operation: () => T): T => {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};

const runInReadTransaction = <T>(
  database: DatabaseSync,
  operation: () => T,
): T => {
  database.exec("BEGIN");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};

type FilmRoundSnapshotHashSource = Omit<
  FilmRoundSnapshot,
  "snapshotId" | "snapshotHash"
>;

const getFilmRoundSnapshotHash = (
  snapshot: FilmRoundSnapshotHashSource,
): string => {
  const hashInput = {
    boardId: snapshot.boardId,
    clubId: snapshot.clubId,
    screeningId: snapshot.screeningId,
    scheduledAt: snapshot.scheduledAt,
    lockedAt: snapshot.lockedAt,
    snapshotId: "",
    snapshotHash: "",
    algorithmVersion: snapshot.algorithmVersion,
    revision: snapshot.revision,
    ranking: snapshot.ranking,
    winner: snapshot.winner,
    stats: snapshot.stats,
    ticket: snapshot.ticket,
  };

  return createHash("sha256").update(JSON.stringify(hashInput)).digest("hex");
};

export interface FilmVoteStoreOptions {
  readOnly?: boolean;
}

export const createFilmVoteStore = (
  databasePath: string,
  options?: FilmVoteStoreOptions,
): FilmVoteStore => {
  const readOnly = options?.readOnly ?? false;
  const database = new DatabaseSync(databasePath, { readOnly });
  if (!readOnly) {
    initializeDatabase(database);
  }

  const getRevision = (boardId: string): number => {
    const row = database
      .prepare(
        `SELECT revision
         FROM film_vote_boards
         WHERE board_id = ?`,
      )
      .get(boardId) as VoteRevisionRow | undefined;

    return row?.revision ?? 0;
  };

  const getRanking = (
    boardId: string,
    catalogueFilmIds: number[],
    tieBreakScores?: ReadonlyMap<number, number>,
  ): FilmVoteRankingEntry[] => {
    const countRows = database
      .prepare(
        `SELECT
           film_id,
           COUNT(*) AS votes,
           MIN(vote_id) AS first_vote_order
         FROM film_votes
         WHERE board_id = ?
         GROUP BY film_id`,
      )
      .all(boardId) as unknown as VoteCountRow[];

    const countsByFilmId = new Map(
      countRows.map((row) => [
        row.film_id,
        { firstVoteOrder: row.first_vote_order, votes: row.votes },
      ]),
    );

    return Array.from(new Set(catalogueFilmIds))
      .map((filmId, initialRank) => {
        const count = countsByFilmId.get(filmId);
        return {
          filmId,
          firstVoteOrder: count?.firstVoteOrder ?? Number.MAX_SAFE_INTEGER,
          initialRank,
          votes: count?.votes ?? 0,
        };
      })
      .sort((first, second) => {
        const voteDifference = second.votes - first.votes;
        if (voteDifference !== 0) {
          return voteDifference;
        }

        if (first.votes > 0 && tieBreakScores) {
          const firstScore = tieBreakScores.get(first.filmId);
          const secondScore = tieBreakScores.get(second.filmId);
          if (firstScore !== undefined || secondScore !== undefined) {
            const scoreDifference =
              (secondScore ?? Number.NEGATIVE_INFINITY) -
              (firstScore ?? Number.NEGATIVE_INFINITY);
            if (scoreDifference !== 0) {
              return scoreDifference;
            }
          }
        }

        return (
          first.firstVoteOrder - second.firstVoteOrder ||
          first.initialRank - second.initialRank
        );
      })
      .map(({ filmId, votes }) => ({ filmId, votes }));
  };

  const getStoredRoundSnapshot = (
    boardId: string,
  ): FilmRoundSnapshot | null => {
    const row = database
      .prepare(
        `SELECT
           board_id,
           club_id,
           screening_id,
           scheduled_at,
           locked_at,
           snapshot_id,
           snapshot_hash,
           algorithm_version,
           revision,
           snapshot_json
         FROM film_vote_round_snapshots
         WHERE board_id = ?`,
      )
      .get(boardId) as FilmVoteRoundSnapshotRow | undefined;

    if (!row) {
      return null;
    }

    const snapshot = filmRoundSnapshotSchema.parse(
      JSON.parse(row.snapshot_json) as unknown,
    );
    if (
      snapshot.boardId !== row.board_id ||
      snapshot.clubId !== row.club_id ||
      snapshot.screeningId !== row.screening_id ||
      snapshot.scheduledAt !== row.scheduled_at ||
      snapshot.lockedAt !== row.locked_at ||
      snapshot.snapshotId !== row.snapshot_id ||
      snapshot.snapshotHash !== row.snapshot_hash ||
      snapshot.algorithmVersion !== row.algorithm_version ||
      snapshot.revision !== row.revision ||
      getFilmRoundSnapshotHash(snapshot) !== snapshot.snapshotHash ||
      snapshot.snapshotId !== `snapshot-${snapshot.snapshotHash.slice(0, 24)}`
    ) {
      throw new Error("Stored film round snapshot metadata is inconsistent.");
    }

    return freezeFilmRoundSnapshot(snapshot);
  };

  const isRoundClosed = (boardId: string): boolean =>
    Boolean(
      database
        .prepare(
          `SELECT snapshot_id
           FROM film_vote_round_snapshots
           WHERE board_id = ?`,
        )
        .get(boardId),
    );

  const setVote = (
    boardId: string,
    filmId: number,
    voterKey: string,
    hasVoted: boolean,
  ): boolean =>
    runInTransaction(database, () => {
      if (isRoundClosed(boardId)) {
        throw new FilmRoundClosedError();
      }

      const updatedAt = new Date().toISOString();
      const result = hasVoted
        ? database
            .prepare(
              `INSERT OR IGNORE INTO film_votes (
                 board_id,
                 film_id,
                 voter_key,
                 created_at
               ) VALUES (?, ?, ?, ?)`,
            )
            .run(boardId, filmId, voterKey, updatedAt)
        : database
            .prepare(
              `DELETE FROM film_votes
               WHERE board_id = ? AND film_id = ? AND voter_key = ?`,
            )
            .run(boardId, filmId, voterKey);

      if (result.changes === 0) {
        return false;
      }

      database
        .prepare(
          `INSERT INTO film_vote_boards (board_id, revision, updated_at)
           VALUES (?, 1, ?)
           ON CONFLICT(board_id) DO UPDATE SET
             revision = film_vote_boards.revision + 1,
             updated_at = excluded.updated_at`,
        )
        .run(boardId, updatedAt);

      return true;
    });

  const lockRound = (
    boardId: string,
    rawMetadata: FilmRoundLockMetadata,
    expectedRevision: number,
  ): FilmRoundSnapshot =>
    runInTransaction(database, () => {
      const metadata = filmRoundLockMetadataSchema.parse(rawMetadata);
      if (boardId !== `${metadata.clubId}-${metadata.screeningId}`) {
        throw new Error(
          "The voting board must match the round club and screening.",
        );
      }

      const existing = getStoredRoundSnapshot(boardId);
      if (existing) {
        return existing;
      }

      const currentRevision = getRevision(boardId);
      if (
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision !== currentRevision
      ) {
        throw new FilmRoundRevisionConflictError(
          expectedRevision,
          currentRevision,
        );
      }

      const catalogueFilmIds = metadata.catalogue.map((film) => film.id);
      const tieBreakScores = new Map(
        metadata.catalogue.map((film) => [film.id, film.tmdbVoteAverage]),
      );
      const catalogueFilmIdSet = new Set(catalogueFilmIds);
      const unlistedVote = (
        database
          .prepare(
            `SELECT DISTINCT film_id
             FROM film_votes
             WHERE board_id = ?`,
          )
          .all(boardId) as unknown as VoteFilmIdRow[]
      ).find((row) => !catalogueFilmIdSet.has(row.film_id));
      if (unlistedVote) {
        throw new Error(
          "The voting round contains a film outside its catalogue.",
        );
      }
      const ranking = getRanking(boardId, catalogueFilmIds, tieBreakScores);
      const filmsById = new Map(
        metadata.catalogue.map((film) => [film.id, film]),
      );
      const snapshotRanking = ranking.flatMap((entry) => {
        const film = filmsById.get(entry.filmId);
        return film
          ? [
              {
                film: {
                  id: film.id,
                  title: film.title,
                  year: film.year,
                  coverImage: film.coverImage,
                },
                tmdbVoteAverage: film.tmdbVoteAverage,
                votes: entry.votes,
              },
            ]
          : [];
      });
      const winner = snapshotRanking.find((entry) => entry.votes > 0) ?? null;
      const stats = database
        .prepare(
          `SELECT
             COUNT(*) AS total_votes,
             COUNT(DISTINCT voter_key) AS participating_devices,
             MAX(created_at) AS last_vote_at
           FROM film_votes
           WHERE board_id = ?`,
        )
        .get(boardId) as unknown as VoteStatsRow;

      const lockedAt = new Date().toISOString();
      const algorithmVersion =
        metadata.algorithmVersion ?? FILM_ROUND_ALGORITHM_VERSION;
      const ticket = winner
        ? (metadata.ticketTemplates[String(winner.film.id)] ?? null)
        : null;
      if (
        winner &&
        (!ticket ||
          ticket.film.id !== winner.film.id ||
          ticket.film.title !== winner.film.title ||
          ticket.film.year !== winner.film.year ||
          ticket.film.coverImage !== winner.film.coverImage)
      ) {
        throw new Error("The winning film is missing its ticket template.");
      }
      const seed: FilmRoundSnapshotHashSource = {
        boardId,
        clubId: metadata.clubId,
        screeningId: metadata.screeningId,
        scheduledAt: metadata.scheduledAt,
        lockedAt,
        algorithmVersion,
        revision: currentRevision,
        ranking: snapshotRanking,
        winner,
        stats: {
          totalVotes: stats.total_votes,
          participatingDevices: stats.participating_devices,
          lastVoteAt: stats.last_vote_at,
        },
        ticket,
      };
      const snapshotHash = getFilmRoundSnapshotHash(seed);
      const snapshot = filmRoundSnapshotSchema.parse({
        ...seed,
        snapshotId: `snapshot-${snapshotHash.slice(0, 24)}`,
        snapshotHash,
      });
      const snapshotJson = JSON.stringify(snapshot);
      const persistedSnapshot = filmRoundSnapshotSchema.parse(
        JSON.parse(snapshotJson) as unknown,
      );

      database
        .prepare(
          `INSERT INTO film_vote_round_snapshots (
             board_id,
             club_id,
             screening_id,
             scheduled_at,
             locked_at,
             snapshot_id,
             snapshot_hash,
             algorithm_version,
             revision,
             snapshot_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          boardId,
          metadata.clubId,
          metadata.screeningId,
          metadata.scheduledAt,
          lockedAt,
          snapshot.snapshotId,
          snapshot.snapshotHash,
          snapshot.algorithmVersion,
          snapshot.revision,
          JSON.stringify(persistedSnapshot),
        );

      return freezeFilmRoundSnapshot(persistedSnapshot);
    });

  const getRoundSnapshot = (boardId: string): FilmRoundSnapshot | null => {
    try {
      return runInReadTransaction(database, () =>
        getStoredRoundSnapshot(boardId),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("no such table: film_vote_round_snapshots")
      ) {
        return null;
      }
      throw error;
    }
  };

  return {
    close() {
      database.close();
    },

    getLockedRound: getRoundSnapshot,

    getRoundSnapshot,

    getSnapshot(boardId, voterKey, catalogueFilmIds, tieBreakScores) {
      return runInReadTransaction(database, () => {
        const votedRows = database
          .prepare(
            `SELECT film_id
             FROM film_votes
             WHERE board_id = ? AND voter_key = ?
             ORDER BY vote_id ASC`,
          )
          .all(boardId, voterKey) as unknown as VotedFilmRow[];

        return {
          boardId,
          ranking: getRanking(boardId, catalogueFilmIds, tieBreakScores),
          revision: getRevision(boardId),
          votedFilmIds: votedRows.map((row) => row.film_id),
        };
      });
    },

    getResults(boardId, catalogueFilmIds, tieBreakScores) {
      return runInReadTransaction(database, () => {
        const stats = database
          .prepare(
            `SELECT
               COUNT(*) AS total_votes,
               COUNT(DISTINCT voter_key) AS participating_devices,
               MAX(created_at) AS last_vote_at
             FROM film_votes
             WHERE board_id = ?`,
          )
          .get(boardId) as unknown as VoteStatsRow;

        return {
          boardId,
          lastVoteAt: stats.last_vote_at,
          participatingDevices: stats.participating_devices,
          ranking: getRanking(boardId, catalogueFilmIds, tieBreakScores),
          revision: getRevision(boardId),
          totalVotes: stats.total_votes,
        };
      });
    },

    lockRound,

    recordVote(boardId, filmId, voterKey) {
      return setVote(boardId, filmId, voterKey, true);
    },

    setVote,
  };
};

let defaultStore: FilmVoteStore | null = null;

export const getFilmVoteStore = (): FilmVoteStore => {
  defaultStore ??= createFilmVoteStore(CLUB_SQLITE_PATH);
  return defaultStore;
};
