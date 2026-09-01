import { DatabaseSync } from "node:sqlite";
import { CLUB_SQLITE_PATH } from "@/lib/storagePaths";

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

interface VoteStatsRow {
  last_vote_at: string | null;
  participating_devices: number;
  total_votes: number;
}

export interface FilmVoteStore {
  close(): void;
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

export const createFilmVoteStore = (databasePath: string): FilmVoteStore => {
  const database = new DatabaseSync(databasePath);
  initializeDatabase(database);

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

  const setVote = (
    boardId: string,
    filmId: number,
    voterKey: string,
    hasVoted: boolean,
  ): boolean =>
    runInTransaction(database, () => {
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

  return {
    close() {
      database.close();
    },

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
