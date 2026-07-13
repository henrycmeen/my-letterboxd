import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const testDirectory = await fs.mkdtemp(path.join(tmpdir(), 'filmklubb-floor-'));
process.env.CLUB_DB_PATH = path.join(testDirectory, 'floor.sqlite');

const {
  BoardConflictError,
  clearBoard,
  getBoardState,
  replaceBoardMovies,
} = await import('./floorBoard');

const movie = (id: number, title = `Movie ${id}`) => ({
  id,
  title,
  coverImage: `/cover-${id}.webp`,
  x: id * 10,
  y: id * 20,
  rotation: 0,
  score: 0,
});

after(async () => {
  await fs.rm(testDirectory, { force: true, recursive: true });
});

void test('requires an expected version before replacing a board', async () => {
  const boardId = 'missing-precondition';
  const replaceWithoutPrecondition = replaceBoardMovies as unknown as (payload: {
    boardId: string;
    movies: ReturnType<typeof movie>[];
  }) => ReturnType<typeof replaceBoardMovies>;

  await assert.rejects(
    replaceWithoutPrecondition({ boardId, movies: [movie(1)] })
  );
  assert.deepEqual((await getBoardState(boardId)).movies, []);
});

void test('keeps the winning board when a stale writer loses', async () => {
  const boardId = 'stale-writer';
  const first = await replaceBoardMovies({
    boardId,
    expectedVersion: 0,
    movies: [movie(1, 'First writer')],
  });

  assert.equal(first.version, 1);
  await assert.rejects(
    replaceBoardMovies({
      boardId,
      expectedVersion: 0,
      movies: [movie(2, 'Stale writer')],
    }),
    BoardConflictError
  );

  const stored = await getBoardState(boardId);
  assert.equal(stored.version, 1);
  assert.deepEqual(stored.movies.map(({ title }) => title), ['First writer']);
});

void test('clear increments the version and rejects pre-clear writers', async () => {
  const boardId = 'clear-version';
  await replaceBoardMovies({
    boardId,
    expectedVersion: 0,
    movies: [movie(1)],
  });

  const cleared = await clearBoard(boardId, 1);
  assert.equal(cleared.version, 2);
  assert.deepEqual(cleared.movies, []);

  await assert.rejects(
    replaceBoardMovies({
      boardId,
      expectedVersion: 1,
      movies: [movie(2)],
    }),
    BoardConflictError
  );
  assert.equal((await getBoardState(boardId)).version, 2);
});

void test('allows exactly one of two same-version concurrent writes', async () => {
  const boardId = 'concurrent-writers';
  const results = await Promise.allSettled([
    replaceBoardMovies({
      boardId,
      expectedVersion: 0,
      movies: [movie(1)],
    }),
    replaceBoardMovies({
      boardId,
      expectedVersion: 0,
      movies: [movie(2)],
    }),
  ]);

  assert.equal(
    results.filter(({ status }) => status === 'fulfilled').length,
    1
  );
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
  assert.equal((await getBoardState(boardId)).version, 1);
});
