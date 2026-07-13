import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

const ALLOWED_HOSTNAME = 'image.tmdb.org';
const ALLOWED_PATH_PREFIX = '/t/p/';
const ALLOWED_CONTENT_TYPES = new Set([
  'image/avif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 9_000;

export type RemoteImageErrorCode =
  | 'INVALID_URL'
  | 'UNSAFE_ADDRESS'
  | 'UPSTREAM_ERROR'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'TOO_LARGE'
  | 'TIMEOUT';

export class RemoteImageError extends Error {
  public constructor(public readonly code: RemoteImageErrorCode) {
    const messages: Record<RemoteImageErrorCode, string> = {
      INVALID_URL: 'Source image URL is not allowed.',
      UNSAFE_ADDRESS: 'Source image host is not allowed.',
      UPSTREAM_ERROR: 'Source image could not be fetched.',
      UNSUPPORTED_MEDIA_TYPE: 'Source URL does not point to a supported image.',
      TOO_LARGE: 'Source image is too large.',
      TIMEOUT: 'Source image request timed out.',
    };

    super(messages[code]);
    this.name = 'RemoteImageError';
  }
}

export const getRemoteImageHttpStatus = (error: RemoteImageError): number => {
  const statusByCode: Record<RemoteImageErrorCode, number> = {
    INVALID_URL: 400,
    UNSAFE_ADDRESS: 400,
    TOO_LARGE: 413,
    UNSUPPORTED_MEDIA_TYPE: 415,
    UPSTREAM_ERROR: 502,
    TIMEOUT: 504,
  };

  return statusByCode[error.code];
};

interface ResolvedAddress {
  address: string;
  family: number;
}

type ResolveHostname = (hostname: string) => Promise<ResolvedAddress[]>;
type FetchImage = (sourceUrl: string, init: RequestInit) => Promise<Response>;

interface FetchRemoteImageOptions {
  fetchImpl?: FetchImage;
  maxBytes?: number;
  resolveHostname?: ResolveHostname;
  timeoutMs?: number;
}

const resolveHostname: ResolveHostname = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

const isPublicAddress = (address: string): boolean => {
  try {
    const parsed = ipaddr.parse(address);
    const normalized =
      parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()
        ? parsed.toIPv4Address()
        : parsed;

    return normalized.range() === 'unicast';
  } catch {
    return false;
  }
};

export const assertAllowedRemoteImageUrl = (sourceUrl: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new RemoteImageError('INVALID_URL');
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== ALLOWED_HOSTNAME ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    !parsed.pathname.startsWith(ALLOWED_PATH_PREFIX)
  ) {
    throw new RemoteImageError('INVALID_URL');
  }

  return parsed;
};

export const fetchRemoteImage = async (
  sourceUrl: string,
  options: FetchRemoteImageOptions = {}
): Promise<Buffer> => {
  const parsedUrl = assertAllowedRemoteImageUrl(sourceUrl);
  const resolve = options.resolveHostname ?? resolveHostname;
  const fetchImage =
    options.fetchImpl ??
    ((url: string, init: RequestInit) => fetch(url, init));
  const maxBytes = Math.max(1, Math.floor(options.maxBytes ?? DEFAULT_MAX_BYTES));
  const timeoutMs = Math.max(
    1,
    Math.floor(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  );

  const abortController = new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    abortController.abort();
  }, timeoutMs);

  try {
    const timeoutRejection = new Promise<never>((_resolve, reject) => {
      abortController.signal.addEventListener(
        'abort',
        () => reject(new RemoteImageError('TIMEOUT')),
        { once: true }
      );
    });
    const addresses = await Promise.race([
      resolve(parsedUrl.hostname),
      timeoutRejection,
    ]);

    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isPublicAddress(address))
    ) {
      throw new RemoteImageError('UNSAFE_ADDRESS');
    }

    const response = await fetchImage(parsedUrl.href, {
      redirect: 'error',
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new RemoteImageError('UPSTREAM_ERROR');
    }

    const contentType = (response.headers.get('content-type') ?? '')
      .split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new RemoteImageError('UNSUPPORTED_MEDIA_TYPE');
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const declaredBytes = Number(contentLength);
      if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
        throw new RemoteImageError('TOO_LARGE');
      }
    }

    if (!response.body) {
      throw new RemoteImageError('UPSTREAM_ERROR');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RemoteImageError('TOO_LARGE');
      }

      chunks.push(value);
    }

    return Buffer.concat(chunks, totalBytes);
  } catch (error) {
    if (didTimeout || abortController.signal.aborted) {
      throw new RemoteImageError('TIMEOUT');
    }
    if (error instanceof RemoteImageError) {
      throw error;
    }
    throw new RemoteImageError('UPSTREAM_ERROR');
  } finally {
    clearTimeout(timeout);
  }
};
