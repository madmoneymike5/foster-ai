import assert from "node:assert/strict";
import test from "node:test";

import {
  RENEWAL_THRESHOLD_SECONDS,
  shouldRenewSession,
} from "./clerk-actors.mjs";

test("renews an expired session", () => {
  const now = 1_000;
  assert.equal(shouldRenewSession(now - 1, now), true);
});

test("renews a session inside the fifteen-second window", () => {
  const now = 1_000;
  assert.equal(shouldRenewSession(now + RENEWAL_THRESHOLD_SECONDS - 1, now), true);
});

test("does not renew a session at or beyond the threshold", () => {
  const now = 1_000;
  assert.equal(shouldRenewSession(now + RENEWAL_THRESHOLD_SECONDS, now), false);
  assert.equal(shouldRenewSession(now + RENEWAL_THRESHOLD_SECONDS + 1, now), false);
});
