// Phase 3: HMAC signing for run tokens. The client receives a signed token from
// startRun and must echo it on submitRun. The server verifies before accepting
// the run, preventing trivial seed/runId tampering.
//
// Phase 5 will replace this with full action-log replay validation (server runs
// the same engine to recompute the result and reject mismatches).

import { createHmac, randomBytes } from 'crypto';

// Per-environment secret. Set via `firebase functions:config:set runs.secret="..."`
// or the FUNCTIONS_RUN_SECRET env var. A development fallback is provided so the
// emulator works without configuration; production should override.
function secret(): string {
  return (
    process.env.FUNCTIONS_RUN_SECRET ||
    process.env.RUNS_SECRET ||
    'plotbound-dev-secret-replace-in-production'
  );
}

export function signRunToken(runId: string, seed: number, uid: string): string {
  return createHmac('sha256', secret())
    .update(`${runId}:${seed}:${uid}`)
    .digest('hex');
}

export function verifyRunToken(
  runId: string,
  seed: number,
  uid: string,
  token: string,
): boolean {
  const expected = signRunToken(runId, seed, uid);
  // Constant-time comparison to avoid timing side-channels.
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}

export function newRunId(): string {
  return `run_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
}

export function newSeed(): number {
  // 32-bit unsigned int — matches engine/rng.ts mulberry32 input.
  return randomBytes(4).readUInt32BE(0);
}
