import { getLevelProgress, roundXp, sanitizeTotalXp } from '../utils/xp';

export const ONLINE_STALE_WINDOW_MS = 120_000;
export const PRESENCE_HEARTBEAT_MS = 45_000;

const FRIEND_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FRIEND_CODE_RE = /^[A-Z0-9]{6,10}$/;
const SAFE_HTTPS_PHOTO_RE = /^https:\/\/[!-~]+$/;
const SAFE_RASTER_DATA_URL_RE =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

export interface PublicFriendProfile {
  uid: string;
  displayName: string;
  photoDataUrl: string;
  totalXp: number;
  level: number;
  levelTitle: string;
  friendCode: string;
  isOnline: boolean;
  lastSeenMs: number;
  updatedMs: number;
}

export interface FriendCodeLookup {
  uid: string;
  displayName: string;
  code: string;
}

export interface FriendshipRecord {
  pairId: string;
  users: [string, string];
  requesterUid: string;
  recipientUid: string;
  status: 'pending' | 'accepted';
  createdMs: number;
  updatedMs: number;
}

export type SendFriendRequestOutcome =
  | 'sent'
  | 'already-friends'
  | 'already-sent'
  | 'accepted-mutual';

/**
 * Gera um código alfanumérico estável de 8 caracteres a partir do UID.
 * Evita caracteres ambíguos (0/O, 1/I) e sempre atende ^[A-Z0-9]{6,10}$.
 */
export function deriveFriendCode(uid: string): string {
  const clean = uid.trim();
  if (!clean) return 'FOCO0000';

  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + ((i + 1) << 5);
    h2 = Math.imul(h2, 0x85ebca6b);
  }

  let code = '';
  let state = (h1 ^ h2) >>> 0;
  for (let i = 0; i < 8; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223 + (i === 4 ? h2 >>> 0 : 0)) >>> 0;
    const idx = state % FRIEND_CODE_ALPHABET.length;
    code += FRIEND_CODE_ALPHABET[idx];
  }
  return code;
}

export function normalizeFriendCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
}

export function isValidFriendCodeFormat(code: string): boolean {
  return FRIEND_CODE_RE.test(code);
}

export function makePairId(uidA: string, uidB: string): string {
  const a = uidA.trim();
  const b = uidB.trim();
  if (!a || !b || a === b) {
    throw new Error('UIDs inválidos para amizade.');
  }
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function sanitizeFriendPhotoUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 2048 && SAFE_HTTPS_PHOTO_RE.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.length <= 250_000 && SAFE_RASTER_DATA_URL_RE.test(trimmed)) {
    return trimmed;
  }
  return '';
}

export function extractTimestampMs(ts: unknown): number {
  if (typeof ts === 'number' && Number.isFinite(ts) && ts >= 0) {
    return ts;
  }
  if (ts instanceof Date) {
    const ms = ts.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (ts && typeof ts === 'object') {
    const maybe = ts as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof maybe.toMillis === 'function') {
      const ms = maybe.toMillis();
      return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof maybe.seconds === 'number' && Number.isFinite(maybe.seconds)) {
      const ns = typeof maybe.nanoseconds === 'number' ? maybe.nanoseconds : 0;
      return Math.max(0, Math.round(maybe.seconds * 1000 + ns / 1_000_000));
    }
  }
  return 0;
}

export function buildPublicProfilePayload(params: {
  uid: string;
  displayName?: string | null;
  fallbackName?: string | null;
  photoDataUrl?: string | null;
  fallbackPhotoUrl?: string | null;
  totalXp: number;
  isOnline: boolean;
}) {
  const rawName = (params.displayName?.trim() || params.fallbackName?.trim() || '');
  const safeName = (rawName || 'Usuário Foco').slice(0, 60);
  const candidatePhoto =
    params.photoDataUrl?.trim() || params.fallbackPhotoUrl?.trim() || '';
  const safePhoto = sanitizeFriendPhotoUrl(candidatePhoto);
  const safeXp = Math.min(100_000_000, roundXp(sanitizeTotalXp(params.totalXp)));
  const levelProgress = getLevelProgress(safeXp);
  const level = Math.min(15, Math.max(1, Math.floor(levelProgress.currentLevel.level)));
  const levelTitle = (levelProgress.currentLevel.title || `Nível ${level}`).trim().slice(0, 60);
  const friendCode = deriveFriendCode(params.uid);

  return {
    uid: params.uid,
    displayName: safeName,
    photoDataUrl: safePhoto,
    totalXp: safeXp,
    level,
    levelTitle,
    friendCode,
    isOnline: Boolean(params.isOnline),
  };
}

export function isUserCurrentlyOnline(
  profile: Pick<PublicFriendProfile, 'isOnline' | 'lastSeenMs'>,
  nowMs: number = Date.now(),
): boolean {
  if (!profile.isOnline) return false;
  if (!Number.isFinite(profile.lastSeenMs) || profile.lastSeenMs <= 0) return false;
  return nowMs - profile.lastSeenMs <= ONLINE_STALE_WINDOW_MS;
}

export function formatLastSeenPt(
  profile: Pick<PublicFriendProfile, 'isOnline' | 'lastSeenMs'>,
  nowMs: number = Date.now(),
): string {
  if (isUserCurrentlyOnline(profile, nowMs)) {
    return 'Online agora';
  }
  if (!Number.isFinite(profile.lastSeenMs) || profile.lastSeenMs <= 0) {
    return 'Offline';
  }
  const diffMs = Math.max(0, nowMs - profile.lastSeenMs);
  if (diffMs < 180_000) {
    return 'Visto agora há pouco';
  }
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `Visto há ${diffMinutes} min`;
  }
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 24) {
    return `Visto há ${diffHours} h`;
  }
  const diffDays = Math.floor(diffMs / 86_400_000);
  return `Visto há ${diffDays} d`;
}

export function sortFriendsByPresence<T extends PublicFriendProfile>(
  friends: T[],
  nowMs: number = Date.now(),
): T[] {
  return [...friends].sort((a, b) => {
    const aOnline = isUserCurrentlyOnline(a, nowMs) ? 1 : 0;
    const bOnline = isUserCurrentlyOnline(b, nowMs) ? 1 : 0;
    if (aOnline !== bOnline) return bOnline - aOnline;

    if (a.lastSeenMs !== b.lastSeenMs) return b.lastSeenMs - a.lastSeenMs;
    if (a.totalXp !== b.totalXp) return b.totalXp - a.totalXp;
    return a.displayName.localeCompare(b.displayName, 'pt-BR');
  });
}

export function parsePublicProfileDoc(
  uid: string,
  data: Record<string, unknown>,
): PublicFriendProfile {
  const safeXp = roundXp(sanitizeTotalXp(Number(data.totalXp) || 0));
  const computed = getLevelProgress(safeXp);
  const rawLevel = Number(data.level);
  const level =
    Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 15
      ? rawLevel
      : computed.currentLevel.level;
  const levelTitle =
    typeof data.levelTitle === 'string' && data.levelTitle.trim()
      ? data.levelTitle.trim().slice(0, 60)
      : computed.currentLevel.title;

  return {
    uid: typeof data.uid === 'string' && data.uid ? data.uid : uid,
    displayName:
      typeof data.displayName === 'string' && data.displayName.trim()
        ? data.displayName.trim().slice(0, 60)
        : 'Usuário Foco',
    photoDataUrl: sanitizeFriendPhotoUrl(data.photoDataUrl),
    totalXp: safeXp,
    level,
    levelTitle,
    friendCode:
      typeof data.friendCode === 'string' && isValidFriendCodeFormat(data.friendCode)
        ? data.friendCode
        : deriveFriendCode(uid),
    isOnline: data.isOnline === true,
    lastSeenMs: extractTimestampMs(data.lastSeenAt),
    updatedMs: extractTimestampMs(data.updatedAt),
  };
}
