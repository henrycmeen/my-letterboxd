import assert from "node:assert/strict";
import test from "node:test";
import type { NextApiRequest } from "next";
import {
  createVoterKey,
  resolveTrustedClientIp,
} from "./voterIdentity";

const request = ({
  clientIp,
  forwardedFor,
  remoteAddress,
}: {
  clientIp?: string;
  forwardedFor?: string;
  remoteAddress?: string;
}) =>
  ({
    headers: {
      ...(clientIp ? { "x-client-ip": clientIp } : {}),
      ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
    },
    socket: { remoteAddress },
  }) as unknown as NextApiRequest;

void test("trusts Caddy's client header only over the loopback proxy", () => {
  assert.equal(
    resolveTrustedClientIp(
      request({ clientIp: "203.0.113.8", remoteAddress: "127.0.0.1" }),
    ),
    "203.0.113.8",
  );

  assert.equal(
    resolveTrustedClientIp(
      request({ clientIp: "203.0.113.8", remoteAddress: "192.168.1.20" }),
    ),
    "192.168.1.20",
  );
});

void test("does not trust a client supplied forwarded-for chain", () => {
  assert.equal(
    resolveTrustedClientIp(
      request({
        forwardedFor: "203.0.113.8, 198.51.100.2",
        remoteAddress: "192.168.1.20",
      }),
    ),
    "192.168.1.20",
  );
});

void test("normalizes IPv4-mapped addresses", () => {
  assert.equal(
    resolveTrustedClientIp(request({ remoteAddress: "::ffff:192.0.2.4" })),
    "192.0.2.4",
  );
});

void test("creates a stable keyed identity without exposing the IP", () => {
  const first = createVoterKey("203.0.113.8", Buffer.alloc(32, 7));
  const second = createVoterKey("203.0.113.8", Buffer.alloc(32, 7));

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first.includes("203.0.113.8"), false);
});
