import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import type { NextApiRequest, NextApiResponse } from 'next';

const testDirectory = await fs.mkdtemp(
  path.join(tmpdir(), 'filmklubb-floor-api-')
);
process.env.CLUB_DB_PATH = path.join(testDirectory, 'floor.sqlite');

const { default: handler } = await import('./floor');

interface RecordedResponse {
  body: unknown;
  statusCode: number;
}

const invoke = async ({
  body,
  method,
  query = {},
}: {
  body?: unknown;
  method: string;
  query?: Record<string, string | string[]>;
}): Promise<RecordedResponse> => {
  let responseBody: unknown;
  let statusCode = 200;

  const request = { body, method, query } as unknown as NextApiRequest;
  const response = {
    json(payload: unknown) {
      responseBody = payload;
      return this;
    },
    setHeader() {
      return this;
    },
    status(nextStatusCode: number) {
      statusCode = nextStatusCode;
      return this;
    },
  } as unknown as NextApiResponse;

  await handler(request, response);
  return { body: responseBody, statusCode };
};

const movie = {
  id: 1,
  title: 'API contract movie',
  coverImage: '/cover-1.webp',
  x: 10,
  y: 20,
  rotation: 0,
  score: 0,
};

after(async () => {
  await fs.rm(testDirectory, { force: true, recursive: true });
});

void test('PUT requires an explicit board version', async () => {
  const response = await invoke({
    method: 'PUT',
    query: { boardId: 'put-precondition' },
    body: { boardId: 'put-precondition', movies: [movie] },
  });

  assert.equal(response.statusCode, 428);
});

void test('a stale PUT returns 409 without replacing the winner', async () => {
  const boardId = 'put-conflict';
  const winner = await invoke({
    method: 'PUT',
    query: { boardId },
    body: { boardId, expectedVersion: 0, movies: [movie] },
  });
  assert.equal(winner.statusCode, 200);

  const stale = await invoke({
    method: 'PUT',
    query: { boardId },
    body: {
      boardId,
      expectedVersion: 0,
      movies: [{ ...movie, id: 2, title: 'Stale writer' }],
    },
  });
  assert.equal(stale.statusCode, 409);

  const stored = await invoke({ method: 'GET', query: { boardId } });
  assert.equal(stored.statusCode, 200);
  assert.deepEqual(
    (stored.body as { movies: Array<{ title: string }> }).movies.map(
      ({ title }) => title
    ),
    ['API contract movie']
  );
});

void test('DELETE requires a non-empty board version', async () => {
  const boardId = 'delete-precondition';

  for (const expectedVersion of [undefined, '']) {
    const response = await invoke({
      method: 'DELETE',
      query: {
        boardId,
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
      },
    });
    assert.equal(response.statusCode, 428);
  }
});

void test('a stale DELETE returns 409 and keeps the board', async () => {
  const boardId = 'delete-conflict';
  await invoke({
    method: 'PUT',
    query: { boardId },
    body: { boardId, expectedVersion: 0, movies: [movie] },
  });

  const stale = await invoke({
    method: 'DELETE',
    query: { boardId, expectedVersion: '0' },
  });
  assert.equal(stale.statusCode, 409);

  const stored = await invoke({ method: 'GET', query: { boardId } });
  assert.equal(
    (stored.body as { movies: unknown[] }).movies.length,
    1
  );
});
