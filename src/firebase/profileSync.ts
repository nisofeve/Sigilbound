// Firestore profile sync. The profile shape mirrors the local one (storage/profile.ts);
// Phase 3 treats the cloud as authoritative when signed in, with localStorage as
// the fallback / offline cache. Phase 4 adds explicit conflict resolution.

import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { getFirebase } from './client';
import { loadProfile, saveProfile, type Profile } from '@storage/index';

function profileRef(db: Firestore, uid: string) {
  return doc(db, 'profiles', uid);
}

// Pull the cloud profile down to local storage on sign-in. If no cloud doc
// exists, push the current local profile up so the player keeps any anonymous
// progress they had before the first auth.
export async function pullOrSeedProfile(uid: string): Promise<Profile> {
  const fb = getFirebase();
  if (!fb) return loadProfile();

  const ref = profileRef(fb.firestore, uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const cloud = snap.data() as Profile;
    saveProfile(cloud);
    return cloud;
  }

  // No cloud doc yet — seed it from local.
  const local = loadProfile();
  await setDoc(ref, local);
  return local;
}

// Push a profile change up to Firestore. No-op if cloud is disabled.
// Phase 3: simple last-write-wins, no version vector. Good enough for single-device.
export async function pushProfile(uid: string, profile: Profile): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  await setDoc(profileRef(fb.firestore, uid), profile, { merge: true });
}
