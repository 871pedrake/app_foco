import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { handleFirestoreError, OperationType } from './sync';
import {
  buildPublicProfilePayload,
  extractTimestampMs,
  isValidFriendCodeFormat,
  makePairId,
  normalizeFriendCode,
  parsePublicProfileDoc,
  type FriendCodeLookup,
  type FriendshipRecord,
  type PublicFriendProfile,
  type SendFriendRequestOutcome,
} from './friendsHelpers';

export * from './friendsHelpers';

const syncedCodeCache = new Map<string, string>();

function isPermissionDeniedError(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? '';
  const msg = error instanceof Error ? error.message : String(error);
  return (
    code === 'permission-denied' ||
    msg.toLowerCase().includes('missing or insufficient permissions')
  );
}

export async function publishPublicProfileSnapshot(params: {
  uid: string;
  displayName?: string | null;
  fallbackName?: string | null;
  photoDataUrl?: string | null;
  fallbackPhotoUrl?: string | null;
  totalXp: number;
  isOnline: boolean;
}): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== params.uid) return;

  const payload = buildPublicProfilePayload(params);
  const profilePath = `publicProfiles/${params.uid}`;

  try {
    await setDoc(doc(db, 'publicProfiles', params.uid), {
      ...payload,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.WRITE, profilePath);
    }
    throw error;
  }

  const codeSignature = `${payload.friendCode}:${payload.displayName}`;
  if (syncedCodeCache.get(params.uid) !== codeSignature) {
    const codePath = `friendCodes/${payload.friendCode}`;
    try {
      await setDoc(doc(db, 'friendCodes', payload.friendCode), {
        uid: params.uid,
        displayName: payload.displayName,
        updatedAt: serverTimestamp(),
      });
      syncedCodeCache.set(params.uid, codeSignature);
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        handleFirestoreError(error, OperationType.WRITE, codePath);
      }
    }
  }
}

export async function markUserOffline(uid: string): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const path = `publicProfiles/${uid}`;
  try {
    await updateDoc(doc(db, 'publicProfiles', uid), {
      isOnline: false,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    const code = (error as { code?: string })?.code ?? '';
    if (code === 'not-found') return;
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
}

export async function lookupUserByFriendCode(
  rawCode: string,
): Promise<FriendCodeLookup | null> {
  const code = normalizeFriendCode(rawCode);
  if (!isValidFriendCodeFormat(code)) return null;

  const path = `friendCodes/${code}`;
  try {
    const snap = await getDoc(doc(db, 'friendCodes', code));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    const uid = typeof data.uid === 'string' ? data.uid.trim() : '';
    const displayName =
      typeof data.displayName === 'string' && data.displayName.trim()
        ? data.displayName.trim().slice(0, 60)
        : 'Usuário Foco';
    if (!uid) return null;
    return { uid, displayName, code };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    throw error;
  }
}

export async function sendFriendRequest(
  currentUid: string,
  targetUid: string,
  existingFriendships: FriendshipRecord[],
): Promise<SendFriendRequestOutcome> {
  if (!auth.currentUser || auth.currentUser.uid !== currentUid) {
    throw new Error('Sessão inválida.');
  }
  if (!targetUid || targetUid === currentUid) {
    throw new Error('Você não pode adicionar seu próprio código.');
  }

  const pairId = makePairId(currentUid, targetUid);
  const existing = existingFriendships.find((item) => item.pairId === pairId);

  if (existing) {
    if (existing.status === 'accepted') {
      return 'already-friends';
    }
    if (existing.requesterUid === currentUid) {
      return 'already-sent';
    }
    await acceptFriendRequest(currentUid, pairId);
    return 'accepted-mutual';
  }

  const sortedUsers: [string, string] =
    currentUid < targetUid ? [currentUid, targetUid] : [targetUid, currentUid];
  const path = `friendships/${pairId}`;

  try {
    await setDoc(doc(db, 'friendships', pairId), {
      users: sortedUsers,
      requesterUid: currentUid,
      recipientUid: targetUid,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return 'sent';
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    throw error;
  }
}

export async function acceptFriendRequest(currentUid: string, pairId: string): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== currentUid) {
    throw new Error('Sessão inválida.');
  }
  const path = `friendships/${pairId}`;
  try {
    await updateDoc(doc(db, 'friendships', pairId), {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    throw error;
  }
}

export async function removeOrCancelFriendship(pairId: string): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('Sessão inválida.');
  }
  const path = `friendships/${pairId}`;
  try {
    await deleteDoc(doc(db, 'friendships', pairId));
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
    throw error;
  }
}

export function subscribeToFriendships(
  uid: string,
  onData: (items: FriendshipRecord[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const q = query(collection(db, 'friendships'), where('users', 'array-contains', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: FriendshipRecord[] = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as Record<string, unknown>;
        const rawUsers = Array.isArray(data.users)
          ? data.users.filter((u): u is string => typeof u === 'string' && u.length > 0)
          : [];
        if (rawUsers.length !== 2) continue;

        const users: [string, string] =
          rawUsers[0] < rawUsers[1] ? [rawUsers[0], rawUsers[1]] : [rawUsers[1], rawUsers[0]];
        const status = data.status === 'accepted' ? 'accepted' : 'pending';
        const requesterUid = typeof data.requesterUid === 'string' ? data.requesterUid : '';
        const recipientUid = typeof data.recipientUid === 'string' ? data.recipientUid : '';
        if (!requesterUid || !recipientUid) continue;

        list.push({
          pairId: docSnap.id,
          users,
          requesterUid,
          recipientUid,
          status,
          createdMs: extractTimestampMs(data.createdAt),
          updatedMs: extractTimestampMs(data.updatedAt),
        });
      }
      onData(list);
    },
    (error) => {
      onError?.(error);
    },
  );
}

export function subscribeToPublicProfile(
  uid: string,
  onData: (profile: PublicFriendProfile | null) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'publicProfiles', uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(parsePublicProfileDoc(uid, snapshot.data() as Record<string, unknown>));
    },
    (error) => {
      onError?.(error);
    },
  );
}
