import { createHmac, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { NextApiRequest } from "next";
import ipaddr from "ipaddr.js";
import { CLUB_SQLITE_PATH } from "@/lib/storagePaths";

const SECRET_BYTE_LENGTH = 32;

const normalizeIp = (rawAddress: string | undefined): string | null => {
  const address = rawAddress?.trim();
  if (!address || !ipaddr.isValid(address)) {
    return null;
  }

  const parsed = ipaddr.parse(address);
  if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
    return parsed.toIPv4Address().toString();
  }

  return parsed.toString();
};

const isLoopback = (address: string): boolean =>
  ipaddr.parse(address).range() === "loopback";

const firstHeaderValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

export const resolveTrustedClientIp = (req: NextApiRequest): string | null => {
  const remoteAddress = normalizeIp(req.socket.remoteAddress);
  if (!remoteAddress) {
    return null;
  }

  if (isLoopback(remoteAddress)) {
    const proxiedAddress = normalizeIp(
      firstHeaderValue(req.headers["x-client-ip"]),
    );
    if (proxiedAddress) {
      return proxiedAddress;
    }
  }

  return remoteAddress;
};

export const createVoterKey = (
  ipAddress: string,
  secret: Uint8Array,
): string => {
  if (secret.byteLength < SECRET_BYTE_LENGTH) {
    throw new Error("Film vote secret must contain at least 32 bytes.");
  }

  return createHmac("sha256", secret).update(ipAddress).digest("hex");
};

const getSecretPath = (): string => {
  const configuredPath = process.env.FILM_VOTE_SECRET_PATH?.trim();
  return configuredPath && configuredPath.length > 0
    ? configuredPath
    : path.join(path.dirname(CLUB_SQLITE_PATH), ".film-vote-secret");
};

const readSecret = async (secretPath: string): Promise<Buffer> => {
  const secret = await fs.readFile(secretPath);
  if (secret.byteLength < SECRET_BYTE_LENGTH) {
    throw new Error("Film vote secret file is invalid.");
  }
  return secret;
};

let secretPromise: Promise<Buffer> | null = null;

export const getOrCreateVoterSecret = async (): Promise<Buffer> => {
  if (secretPromise) {
    return secretPromise;
  }

  secretPromise = (async () => {
    const secretPath = getSecretPath();
    await fs.mkdir(path.dirname(secretPath), { recursive: true });

    try {
      return await readSecret(secretPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    const generatedSecret = randomBytes(SECRET_BYTE_LENGTH);
    try {
      const handle = await fs.open(secretPath, "wx", 0o600);
      try {
        await handle.writeFile(generatedSecret);
      } finally {
        await handle.close();
      }
      return generatedSecret;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return readSecret(secretPath);
      }
      throw error;
    }
  })();

  return secretPromise;
};
