import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { STORAGE_KEYS } from '../types/foco';
import { sanitizeProfile } from '../utils/focoStorage';

/**
 * Sincronização segura com a nuvem.
 *
 * O app continua salvando no localStorage como sempre. Esta camada:
 *  - isola os dados locais por UID para evitar vazamento entre contas no mesmo navegador;
 *  - valida chaves, tipos, JSON e limites de tamanho antes de enviar ou aplicar dados remotos;
 *  - envia serverUpdatedAt via serverTimestamp() validado pelas regras do Firestore.
 */

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function isPermissionDeniedError(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? '';
  const msg = error instanceof Error ? error.message : String(error);
  return (
    code === 'permission-denied' ||
    msg.toLowerCase().includes('missing or insufficient permissions')
  );
}

const SYNCED_KEYS: string[] = Object.values(STORAGE_KEYS);
const SYNCED_KEY_SET = new Set<string>(SYNCED_KEYS);
const META_MODIFIED_AT = 'foco_cloud_modified_at_v1';
const META_OWNER_UID = 'foco_cloud_owner_uid_v1';
const PUSH_DELAY_MS = 1500;
const NETWORK_TIMEOUT_MS = 10_000;
const MAX_CLIENT_TIMESTAMP = 4_102_444_800_000;

const KEY_MAX_LENGTH: Record<string, number> = {
  [STORAGE_KEYS.TASKS]: 150_000,
  [STORAGE_KEYS.HISTORY]: 100_000,
  [STORAGE_KEYS.COMPLETION_LOGS]: 250_000,
  [STORAGE_KEYS.TOTAL_XP]: 32,
  [STORAGE_KEYS.XP_BY_DATE]: 100_000,
  [STORAGE_KEYS.LAST_ACTIVE_DAY]: 32,
  [STORAGE_KEYS.JOURNAL]: 300_000,
  [STORAGE_KEYS.VICES]: 150_000,
  [STORAGE_KEYS.IMPULSE_LOGS]: 150_000,
  [STORAGE_KEYS.PROFILE]: 260_000,
  [STORAGE_KEYS.THEME]: 16,
  [STORAGE_KEYS.SFX]: 16,
  [STORAGE_KEYS.BGM]: 16,
  [STORAGE_KEYS.RAIN]: 16,
  [STORAGE_KEYS.BGM_VOL]: 16,
  [STORAGE_KEYS.RAIN_VOL]: 16,
};

const JSON_KEYS = new Set<string>([
  STORAGE_KEYS.TASKS,
  STORAGE_KEYS.HISTORY,
  STORAGE_KEYS.COMPLETION_LOGS,
  STORAGE_KEYS.XP_BY_DATE,
  STORAGE_KEYS.JOURNAL,
  STORAGE_KEYS.VICES,
  STORAGE_KEYS.IMPULSE_LOGS,
  STORAGE_KEYS.PROFILE,
]);

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

function clampClientTimestamp(ts: number): number {
  if (!Number.isFinite(ts) || ts < 0) return 0;
  return Math.min(Math.floor(ts), MAX_CLIENT_TIMESTAMP);
}

function getLocalModifiedAt(): number {
  try {
    return clampClientTimestamp(Number(localStorage.getItem(META_MODIFIED_AT)) || 0);
  } catch {
    return 0;
  }
}

function setLocalModifiedAt(ts: number): void {
  const original = originalSetItem ?? Storage.prototype.setItem;
  original.call(localStorage, META_MODIFIED_AT, String(clampClientTimestamp(ts)));
}

function getStoredOwnerUid(): string | null {
  try {
    return localStorage.getItem(META_OWNER_UID);
  } catch {
    return null;
  }
}

function setStoredOwnerUid(uid: string): void {
  const original = originalSetItem ?? Storage.prototype.setItem;
  original.call(localStorage, META_OWNER_UID, uid);
}

function wipeLocalSyncedKeys(): void {
  suppress = true;
  try {
    for (const key of SYNCED_KEYS) localStorage.removeItem(key);
    localStorage.removeItem(META_MODIFIED_AT);
    localStorage.removeItem(META_OWNER_UID);
  } finally {
    suppress = false;
  }
}

function isValidSyncedEntry(key: string, value: unknown): value is string {
  if (!SYNCED_KEY_SET.has(key) || typeof value !== 'string') return false;
  const maxLen = KEY_MAX_LENGTH[key] ?? 150_000;
  if (value.length > maxLen) return false;
  if (JSON_KEYS.has(key)) {
    try {
      JSON.parse(value);
    } catch {
      return false;
    }
  }
  return true;
}

function normalizeRemoteValue(key: string, value: string): string {
  if (key === STORAGE_KEYS.PROFILE) {
    const parsed = JSON.parse(value);
    return JSON.stringify(sanitizeProfile(parsed));
  }
  return value;
}

function collectLocalData(): Record<string, string> {
  const data: Record<string, string> = Object.create(null);
  for (const key of SYNCED_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null && isValidSyncedEntry(key, value)) {
      data[key] = value;
    }
  }
  return data;
}

function hasAnyLocalData(): boolean {
  return SYNCED_KEYS.some((k) => localStorage.getItem(k) !== null);
}

function applyCloudData(data: Record<string, unknown>, cloudTs: number): void {
  suppress = true;
  try {
    for (const key of SYNCED_KEYS) {
      const hasOwn = Object.prototype.hasOwnProperty.call(data, key);
      const rawValue = hasOwn ? data[key] : undefined;
      if (isValidSyncedEntry(key, rawValue)) {
        try {
          localStorage.setItem(key, normalizeRemoteValue(key, rawValue));
        } catch {
          localStorage.removeItem(key);
        }
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
  if (!currentUid || !hasSyncedThisSession) return;
  if (auth.currentUser?.uid !== currentUid) return;

  const ts = getLocalModifiedAt() || clampClientTimestamp(Date.now());
  const path = `users/${currentUid}`;
  try {
    await withTimeout(
      setDoc(doc(db, 'users', currentUid), {
        data: collectLocalData(),
        clientUpdatedAt: ts,
        serverUpdatedAt: serverTimestamp(),
      }),
    );
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    throw error;
  }
}

function schedulePush(): void {
  if (!currentUid || !hasSyncedThisSession) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushing = pushNow()
      .catch(() => {
        // Sem internet ou erro transitório: a próxima alteração tenta de novo.
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
    if (this === window.localStorage && !suppress && SYNCED_KEY_SET.has(key)) {
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
    if (this === window.localStorage && !suppress && SYNCED_KEY_SET.has(key)) {
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
 * Compara a nuvem com este dispositivo e usa a versão mais recente.
 * Isola dados locais por UID para evitar vazamento entre contas diferentes.
 */
export async function syncWithCloud(uid: string): Promise<SyncResult> {
  const previousOwner = getStoredOwnerUid();
  if (previousOwner && previousOwner !== uid) {
    wipeLocalSyncedKeys();
  }

  currentUid = uid;
  const path = `users/${uid}`;
  try {
    const snap = await withTimeout(getDoc(doc(db, 'users', uid)));
    setStoredOwnerUid(uid);
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

    const remote = snap.data() as { data?: Record<string, unknown>; clientUpdatedAt?: number };
    const cloudTs = clampClientTimestamp(Number(remote.clientUpdatedAt) || 0);

    if (localTs > cloudTs) {
      hasSyncedThisSession = true;
      await pushNow();
      return 'pushed';
    }
    if (cloudTs > localTs) {
      const remoteData =
        remote.data && typeof remote.data === 'object' && !Array.isArray(remote.data)
          ? remote.data
          : {};
      applyCloudData(remoteData, cloudTs);
      hasSyncedThisSession = true;
      return 'pulled';
    }
    hasSyncedThisSession = true;
    return 'same';
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.GET, path);
    }
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
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  wipeLocalSyncedKeys();
  currentUid = null;
  hasSyncedThisSession = false;
}

export function stopSync(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  currentUid = null;
  hasSyncedThisSession = false;
}

export function isSyncing(): boolean {
  return Boolean(currentUid && hasSyncedThisSession);
}
