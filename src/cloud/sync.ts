import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { STORAGE_KEYS } from '../types/foco';

/**
 * Sincronização com a nuvem.
 *
 * O app continua salvando no localStorage como sempre. Esta camada:
 *  - observa as gravações nas chaves do Foco e envia uma cópia ao Firestore;
 *  - ao entrar numa conta, compara data/hora e usa a versão mais recente.
 */

const SYNCED_KEYS: string[] = Object.values(STORAGE_KEYS);
const META_MODIFIED_AT = 'foco_cloud_modified_at_v1';
const PUSH_DELAY_MS = 1500;
const NETWORK_TIMEOUT_MS = 10_000;

let currentUid: string | null = null;
let hasSyncedThisSession = false;
let suppress = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing: Promise<void> | null = null;
let patched = false;

function withTimeout<T>(promise: Promise<T>, ms = NETWORK_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function getLocalModifiedAt(): number {
  try {
    return Number(localStorage.getItem(META_MODIFIED_AT)) || 0;
  } catch {
    return 0;
  }
}

function setLocalModifiedAt(ts: number): void {
  const original = originalSetItem ?? Storage.prototype.setItem;
  original.call(localStorage, META_MODIFIED_AT, String(ts));
}

function collectLocalData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const key of SYNCED_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return data;
}

function hasAnyLocalData(): boolean {
  return SYNCED_KEYS.some((k) => localStorage.getItem(k) !== null);
}

function applyCloudData(data: Record<string, string>, cloudTs: number): void {
  suppress = true;
  try {
    for (const key of SYNCED_KEYS) {
      if (typeof data[key] === 'string') {
        localStorage.setItem(key, data[key]);
      } else {
        localStorage.removeItem(key);
      }
    }
    setLocalModifiedAt(cloudTs);
  } finally {
    suppress = false;
  }
}

async function pushNow(): Promise<void> {
  if (!db || !currentUid || !hasSyncedThisSession) return;
  const ts = getLocalModifiedAt() || Date.now();
  await withTimeout(
    setDoc(doc(db, 'users', currentUid), {
      data: collectLocalData(),
      clientUpdatedAt: ts,
    }),
  );
}

function schedulePush(): void {
  if (!currentUid || !hasSyncedThisSession) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushing = pushNow()
      .catch(() => {
        // Sem internet: a próxima alteração tenta de novo.
      })
      .finally(() => {
        pushing = null;
      });
  }, PUSH_DELAY_MS);
}

let originalSetItem: typeof Storage.prototype.setItem | null = null;

/** Observa gravações no localStorage (chamar uma vez, antes de montar o app). */
export function installStorageWatcher(): void {
  if (patched || typeof Storage === 'undefined') return;
  patched = true;

  originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const setItem = originalSetItem;

  Storage.prototype.setItem = function (key: string, value: string) {
    if (this === window.localStorage && !suppress && SYNCED_KEYS.includes(key)) {
      const previous = this.getItem(key);
      setItem.call(this, key, value);
      if (previous !== String(value)) {
        setLocalModifiedAt(Date.now());
        schedulePush();
      }
      return;
    }
    setItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function (key: string) {
    if (this === window.localStorage && !suppress && SYNCED_KEYS.includes(key)) {
      const had = this.getItem(key) !== null;
      originalRemoveItem.call(this, key);
      if (had) {
        setLocalModifiedAt(Date.now());
        schedulePush();
      }
      return;
    }
    originalRemoveItem.call(this, key);
  };

  const flush = () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
      void pushNow().catch(() => undefined);
    }
  };
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

export type SyncResult = 'pulled' | 'pushed' | 'same' | 'offline';

/**
 * Compara a nuvem com este computador e usa a versão mais recente.
 * 'pulled' significa que os dados locais foram trocados (o app precisa recarregar).
 */
export async function syncWithCloud(uid: string): Promise<SyncResult> {
  if (!db) return 'offline';
  currentUid = uid;
  try {
    const snap = await withTimeout(getDoc(doc(db, 'users', uid)));
    const localTs = getLocalModifiedAt();

    if (!snap.exists()) {
      hasSyncedThisSession = true;
      if (hasAnyLocalData()) {
        if (!localTs) setLocalModifiedAt(Date.now());
        await pushNow();
        return 'pushed';
      }
      return 'same';
    }

    const remote = snap.data() as { data?: Record<string, string>; clientUpdatedAt?: number };
    const cloudTs = Number(remote.clientUpdatedAt) || 0;

    if (localTs > cloudTs) {
      hasSyncedThisSession = true;
      await pushNow();
      return 'pushed';
    }
    if (cloudTs > localTs) {
      applyCloudData(remote.data ?? {}, cloudTs);
      hasSyncedThisSession = true;
      return 'pulled';
    }
    hasSyncedThisSession = true;
    return 'same';
  } catch {
    return 'offline';
  }
}

/** Reenvia o que estiver pendente e aguarda (usado antes de sair da conta). */
export async function flushPending(): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
    await pushNow().catch(() => undefined);
  }
  if (pushing) await pushing.catch(() => undefined);
}

/** Apaga os dados locais do Foco (ao sair da conta) e para a sincronização. */
export function clearLocalDataAndStop(): void {
  suppress = true;
  try {
    for (const key of SYNCED_KEYS) localStorage.removeItem(key);
    localStorage.removeItem(META_MODIFIED_AT);
  } finally {
    suppress = false;
  }
  currentUid = null;
  hasSyncedThisSession = false;
}

export function stopSync(): void {
  currentUid = null;
  hasSyncedThisSession = false;
}

export function isSyncing(): boolean {
  return Boolean(currentUid && hasSyncedThisSession);
}
