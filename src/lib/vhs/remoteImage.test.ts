import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertAllowedRemoteImageUrl,
  fetchRemoteImage,
  getRemoteImageHttpStatus,
  RemoteImageError,
} from './remoteImage';

const resolvePublicAddress = async () => [
  { address: '93.184.216.34', family: 4 as const },
];

const imageResponse = (
  body: BodyInit = new Uint8Array([1, 2, 3]),
  headers: HeadersInit = { 'content-type': 'image/jpeg' }
) => new Response(body, { status: 200, headers });

const expectRemoteImageError = async (
  promise: Promise<unknown>,
  code: RemoteImageError['code']
) => {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof RemoteImageError && error.code === code
  );
};

void test('accepts the TMDB image paths used by the VHS renderer', () => {
  assert.equal(
    assertAllowedRemoteImageUrl(
      'https://image.tmdb.org/t/p/w780/poster.jpg'
    ).href,
    'https://image.tmdb.org/t/p/w780/poster.jpg'
  );
  assert.equal(
    assertAllowedRemoteImageUrl(
      'https://image.tmdb.org/t/p/original/backdrop.webp'
    ).href,
    'https://image.tmdb.org/t/p/original/backdrop.webp'
  );
});

void test('rejects non-TMDB URLs and lookalike hostnames', () => {
  for (const sourceUrl of [
    'http://image.tmdb.org/t/p/w780/poster.jpg',
    'https://image.tmdb.org.evil.test/t/p/w780/poster.jpg',
    'https://image.tmdb.org./t/p/w780/poster.jpg',
    'https://localhost/t/p/w780/poster.jpg',
    'https://127.0.0.1/poster.jpg',
    'https://169.254.169.254/latest/meta-data',
    'https://image.tmdb.org:444/t/p/w780/poster.jpg',
    'https://user:password@image.tmdb.org/t/p/w780/poster.jpg',
    'https://image.tmdb.org/not-an-image-path/poster.jpg',
  ]) {
    assert.throws(
      () => assertAllowedRemoteImageUrl(sourceUrl),
      (error: unknown) =>
        error instanceof RemoteImageError && error.code === 'INVALID_URL'
    );
  }
});

void test('rejects an allowlisted hostname when any DNS answer is private', async () => {
  await expectRemoteImageError(
    fetchRemoteImage('https://image.tmdb.org/t/p/w780/poster.jpg', {
      resolveHostname: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
      fetchImpl: async () => imageResponse(),
    }),
    'UNSAFE_ADDRESS'
  );
});

void test('forbids redirects when fetching an image', async () => {
  let receivedInit: RequestInit | undefined;

  await fetchRemoteImage('https://image.tmdb.org/t/p/w780/poster.jpg', {
    resolveHostname: resolvePublicAddress,
    fetchImpl: async (_sourceUrl, init) => {
      receivedInit = init;
      return imageResponse();
    },
  });

  assert.equal(receivedInit?.redirect, 'error');
});

void test('rejects unsupported or missing image media types', async () => {
  for (const contentType of ['', 'text/html', 'image/svg+xml', 'image/gif']) {
    await expectRemoteImageError(
      fetchRemoteImage('https://image.tmdb.org/t/p/w780/poster.jpg', {
        resolveHostname: resolvePublicAddress,
        fetchImpl: async () =>
          imageResponse(new Uint8Array([1]),
            contentType ? { 'content-type': contentType } : {}),
      }),
      'UNSUPPORTED_MEDIA_TYPE'
    );
  }
});

void test('accepts an allowlisted image media type with parameters', async () => {
  const result = await fetchRemoteImage(
    'https://image.tmdb.org/t/p/w780/poster.jpg',
    {
      resolveHostname: resolvePublicAddress,
      fetchImpl: async () =>
        imageResponse(new Uint8Array([1, 2]), {
          'content-type': 'image/jpeg; charset=binary',
        }),
    }
  );

  assert.deepEqual(result, Buffer.from([1, 2]));
});

void test('rejects an oversized Content-Length before reading the body', async () => {
  await expectRemoteImageError(
    fetchRemoteImage('https://image.tmdb.org/t/p/w780/poster.jpg', {
      maxBytes: 4,
      resolveHostname: resolvePublicAddress,
      fetchImpl: async () =>
        imageResponse(new Uint8Array([1]), {
          'content-type': 'image/png',
          'content-length': '5',
        }),
    }),
    'TOO_LARGE'
  );
});

void test('stops streaming as soon as the body exceeds the byte limit', async () => {
  await expectRemoteImageError(
    fetchRemoteImage('https://image.tmdb.org/t/p/w780/poster.jpg', {
      maxBytes: 4,
      resolveHostname: resolvePublicAddress,
      fetchImpl: async () =>
        imageResponse(new Uint8Array([1, 2, 3, 4, 5]), {
          'content-type': 'image/webp',
        }),
    }),
    'TOO_LARGE'
  );
});

void test('accepts an image body exactly at the byte limit', async () => {
  const result = await fetchRemoteImage(
    'https://image.tmdb.org/t/p/w780/poster.jpg',
    {
      maxBytes: 4,
      resolveHostname: resolvePublicAddress,
      fetchImpl: async () =>
        imageResponse(new Uint8Array([1, 2, 3, 4]), {
          'content-type': 'image/avif',
        }),
    }
  );

  assert.equal(result.byteLength, 4);
});

void test('aborts an upstream request after the configured timeout', async () => {
  await expectRemoteImageError(
    fetchRemoteImage('https://image.tmdb.org/t/p/w780/poster.jpg', {
      timeoutMs: 5,
      resolveHostname: resolvePublicAddress,
      fetchImpl: async (_sourceUrl, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true }
          );
        }),
    }),
    'TIMEOUT'
  );
});

void test('applies the timeout while resolving the source hostname', async () => {
  await expectRemoteImageError(
    fetchRemoteImage('https://image.tmdb.org/t/p/w780/poster.jpg', {
      timeoutMs: 5,
      resolveHostname: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return resolvePublicAddress();
      },
      fetchImpl: async () => imageResponse(),
    }),
    'TIMEOUT'
  );
});

void test('maps remote image failures to stable HTTP status codes', () => {
  assert.equal(getRemoteImageHttpStatus(new RemoteImageError('INVALID_URL')), 400);
  assert.equal(
    getRemoteImageHttpStatus(new RemoteImageError('UNSAFE_ADDRESS')),
    400
  );
  assert.equal(getRemoteImageHttpStatus(new RemoteImageError('TOO_LARGE')), 413);
  assert.equal(
    getRemoteImageHttpStatus(new RemoteImageError('UNSUPPORTED_MEDIA_TYPE')),
    415
  );
  assert.equal(
    getRemoteImageHttpStatus(new RemoteImageError('UPSTREAM_ERROR')),
    502
  );
  assert.equal(getRemoteImageHttpStatus(new RemoteImageError('TIMEOUT')), 504);
});
