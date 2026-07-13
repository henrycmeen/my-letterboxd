import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LatestVersionedSaveQueue } from './latestVersionedSaveQueue';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

void test('serializes saves and keeps only the latest pending snapshot', async () => {
  const firstResult = deferred<
    { status: 'saved'; version: number }
  >();
  const calls: Array<{ value: string; expectedVersion: number }> = [];
  const saved: Array<{ signature: string; version: number }> = [];

  const queue = new LatestVersionedSaveQueue<string, string>({
    save: async (snapshot, expectedVersion) => {
      calls.push({ value: snapshot.value, expectedVersion });
      if (calls.length === 1) {
        return firstResult.promise;
      }
      return { status: 'saved', version: expectedVersion + 1 };
    },
    onSaved: (snapshot, version) => {
      saved.push({ signature: snapshot.signature, version });
    },
    onConflict: () => {
      assert.fail('No conflict expected.');
    },
  });
  queue.setVersion(0);

  const firstSave = queue.enqueue({ value: 'first', signature: 'sig-1' });
  await Promise.resolve();
  const supersededSave = queue.enqueue({ value: 'second', signature: 'sig-2' });
  const latestSave = queue.enqueue({ value: 'third', signature: 'sig-3' });

  firstResult.resolve({ status: 'saved', version: 1 });
  await Promise.all([firstSave, supersededSave, latestSave, queue.flush()]);

  assert.deepEqual(calls, [
    { value: 'first', expectedVersion: 0 },
    { value: 'third', expectedVersion: 1 },
  ]);
  assert.deepEqual(saved, [
    { signature: 'sig-1', version: 1 },
    { signature: 'sig-3', version: 2 },
  ]);
});

void test('drops stale pending saves and applies the server state on conflict', async () => {
  const conflictResult = deferred<
    { status: 'conflict'; version: number; remote: string }
  >();
  const calls: Array<{ value: string; expectedVersion: number }> = [];
  const conflicts: Array<{ remote: string; version: number }> = [];

  const queue = new LatestVersionedSaveQueue<string, string>({
    save: async (snapshot, expectedVersion) => {
      calls.push({ value: snapshot.value, expectedVersion });
      if (calls.length === 1) {
        return conflictResult.promise;
      }
      return { status: 'saved', version: expectedVersion + 1 };
    },
    onSaved: () => undefined,
    onConflict: (remote, version) => {
      conflicts.push({ remote, version });
    },
  });
  queue.setVersion(1);

  const staleSave = queue.enqueue({ value: 'stale', signature: 'stale' });
  await Promise.resolve();
  const pendingSave = queue.enqueue({ value: 'also stale', signature: 'pending' });
  conflictResult.resolve({ status: 'conflict', version: 2, remote: 'server board' });

  await Promise.all([staleSave, pendingSave, queue.flush()]);
  assert.deepEqual(calls, [{ value: 'stale', expectedVersion: 1 }]);
  assert.deepEqual(conflicts, [{ remote: 'server board', version: 2 }]);

  await queue.enqueue({ value: 'new edit', signature: 'new' });
  assert.deepEqual(calls.at(-1), { value: 'new edit', expectedVersion: 2 });
});

void test('does not send until an initial server version is known', async () => {
  const calls: string[] = [];
  const queue = new LatestVersionedSaveQueue<string, string>({
    save: async (snapshot, expectedVersion) => {
      calls.push(`${snapshot.value}@${expectedVersion}`);
      return { status: 'saved', version: expectedVersion + 1 };
    },
    onSaved: () => undefined,
    onConflict: () => undefined,
  });

  const pending = queue.enqueue({ value: 'waiting', signature: 'waiting' });
  await Promise.resolve();
  assert.deepEqual(calls, []);

  queue.setVersion(4);
  await Promise.all([pending, queue.flush()]);
  assert.deepEqual(calls, ['waiting@4']);
});
