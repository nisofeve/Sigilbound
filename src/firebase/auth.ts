// Anonymous-first auth. The player is signed in transparently on first launch
// so cloud features work without an explicit account-creation step. Phase 4 adds
// the option to upgrade the anonymous account to Google/Apple/email.

import {
  onAuthStateChanged,
  signInAnonymously,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { getFirebase } from './client';

export type AuthStatus =
  | { kind: 'cloud_disabled' }      // No Firebase config in env.
  | { kind: 'signing_in' }
  | { kind: 'signed_in'; uid: string; isAnonymous: boolean }
  | { kind: 'error'; message: string };

// Subscribe to auth state. Resolves the first state synchronously via the callback.
// Returns an unsubscribe function.
export function watchAuth(onChange: (status: AuthStatus) => void): () => void {
  const fb = getFirebase();
  if (!fb) {
    onChange({ kind: 'cloud_disabled' });
    return () => {};
  }

  let started = false;
  const unsub = onAuthStateChanged(
    fb.auth,
    (user) => {
      if (user) {
        onChange({ kind: 'signed_in', uid: user.uid, isAnonymous: user.isAnonymous });
        return;
      }
      // Not signed in → kick off anonymous sign-in once.
      if (!started) {
        started = true;
        onChange({ kind: 'signing_in' });
        signInAnonymously(fb.auth).catch((err) => {
          onChange({ kind: 'error', message: err?.message ?? String(err) });
        });
      }
    },
    (err) => onChange({ kind: 'error', message: err.message }),
  );
  return unsub;
}

export async function signOut(): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  await fbSignOut(fb.auth);
}

export function currentUser(): User | null {
  const fb = getFirebase();
  return fb?.auth.currentUser ?? null;
}
