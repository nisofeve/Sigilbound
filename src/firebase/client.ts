// Firebase client init. Phase 3: real Auth/Firestore/Functions wiring.
// Returns null if no .env.local config — keeps the game playable offline / no-config.

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

interface PlotboundFirebase {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
}

let cached: PlotboundFirebase | null = null;
let initAttempted = false;

function readEnv() {
  const env = import.meta.env;
  const cfg = {
    apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  };
  const useEmulator = env.VITE_USE_FIREBASE_EMULATOR === 'true';
  return { cfg, useEmulator };
}

export function getFirebase(): PlotboundFirebase | null {
  if (cached) return cached;
  if (initAttempted) return null;
  initAttempted = true;

  const { cfg, useEmulator } = readEnv();
  if (!cfg.apiKey || !cfg.projectId) {
    if (typeof window !== 'undefined') {
      console.info('[firebase] Skipping init — no VITE_FIREBASE_* env vars set. Cloud features disabled.');
    }
    return null;
  }

  const app = initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    appId: cfg.appId,
  });
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const functions = getFunctions(app);

  if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    console.info('[firebase] Connected to local emulator suite');
  }

  cached = { app, auth, firestore, functions };
  return cached;
}

export function isCloudEnabled(): boolean {
  return getFirebase() !== null;
}
