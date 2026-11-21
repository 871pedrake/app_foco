import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { Unsubscribe } from 'firebase/firestore';
import {
  Check,
  Clock,
  Copy,
  Loader2,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  acceptFriendRequest,
  deriveFriendCode,
  formatLastSeenPt,
  isUserCurrentlyOnline,
  isValidFriendCodeFormat,
  lookupUserByFriendCode,
  normalizeFriendCode,
  removeOrCancelFriendship,
  sendFriendRequest,
  sortFriendsByPresence,
  subscribeToFriendships,
  subscribeToPublicProfile,
  type FriendshipRecord,
  type PublicFriendProfile,
} from '../cloud/friends';
import { getProfileInitials } from '../utils/focoStorage';
import { formatXp, getLevelProgress } from '../utils/xp';

export interface FriendsDataState {
  friendships: FriendshipRecord[];
  profilesByUid: Record<string, PublicFriendProfile>;
  loading: boolean;
  error: string | null;
  nowMs: number;
  acceptedFriends: PublicFriendProfile[];
  onlineCount: number;
  incomingRequests: Array<{ friendship: FriendshipRecord; profile: PublicFriendProfile | null }>;
  outgoingRequests: Array<{ friendship: FriendshipRecord; profile: PublicFriendProfile | null }>;
}

export function useFriendsData(uid: string | null): FriendsDataState {
  const [friendships, setFriendships] = useState<FriendshipRecord[]>([]);
  const [profilesByUid, setProfilesByUid] = useState<Record<string, PublicFriendProfile>>({});
  const [loading, setLoading] = useState<boolean>(Boolean(uid));
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const profileSubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!uid) {
      for (const unsub of profileSubsRef.current.values()) {
        unsub();
      }
      profileSubsRef.current.clear();
      setFriendships([]);
      setProfilesByUid({});
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubFriendships = subscribeToFriendships(
      uid,
      (items: FriendshipRecord[]) => {
        setFriendships(items);
        setLoading(false);
        setError(null);

        const neededUids = new Set<string>();
        for (const item of items) {
          const otherUid: string = item.users[0] === uid ? item.users[1] : item.users[0];
          if (otherUid && otherUid !== uid) neededUids.add(otherUid);
        }

        // Remove listeners for unfriended/cancelled users
        for (const [subUid, unsub] of profileSubsRef.current.entries()) {
          if (!neededUids.has(subUid)) {
            unsub();
            profileSubsRef.current.delete(subUid);
            setProfilesByUid((prev) => {
              if (!(subUid in prev)) return prev;
              const next = { ...prev };
              delete next[subUid];
              return next;
            });
          }
        }

        // Subscribe to new friends / pending users
        for (const targetUid of neededUids) {
          if (profileSubsRef.current.has(targetUid)) continue;
          const unsubProfile = subscribeToPublicProfile(
            targetUid,
            (profile) => {
              setProfilesByUid((prev) => {
                if (!profile) {
                  if (!(targetUid in prev)) return prev;
                  const next = { ...prev };
                  delete next[targetUid];
                  return next;
                }
                return { ...prev, [targetUid]: profile };
              });
            },
            () => {
              // Se uma amizade acabou de ser removida pelo outro usuário, não quebra a UI.
            },
          );
          profileSubsRef.current.set(targetUid, unsubProfile);
        }
      },
      () => {
        setLoading(false);
        setError('Não foi possível carregar sua lista de amigos no momento.');
      },
    );

    return () => {
      unsubFriendships();
      for (const unsub of profileSubsRef.current.values()) {
        unsub();
      }
      profileSubsRef.current.clear();
    };
  }, [uid]);

  return useMemo(() => {
    if (!uid) {
      return {
        friendships: [],
        profilesByUid: {},
        loading: false,
        error: null,
        nowMs,
        acceptedFriends: [],
        onlineCount: 0,
        incomingRequests: [],
        outgoingRequests: [],
      };
    }

    const acceptedProfiles: PublicFriendProfile[] = [];
    const incomingRequests: Array<{
      friendship: FriendshipRecord;
      profile: PublicFriendProfile | null;
    }> = [];
    const outgoingRequests: Array<{
      friendship: FriendshipRecord;
      profile: PublicFriendProfile | null;
    }> = [];

    for (const item of friendships) {
      const otherUid = item.users[0] === uid ? item.users[1] : item.users[0];
      const profile = profilesByUid[otherUid] ?? null;

      if (item.status === 'accepted') {
        acceptedProfiles.push(
          profile ?? {
            uid: otherUid,
            displayName: 'Amigo Foco',
            photoDataUrl: '',
            totalXp: 0,
            level: 1,
            levelTitle: getLevelProgress(0).currentLevel.title,
            friendCode: deriveFriendCode(otherUid),
            isOnline: false,
            lastSeenMs: 0,
            updatedMs: 0,
          },
        );
      } else if (item.recipientUid === uid) {
        incomingRequests.push({ friendship: item, profile });
      } else {
        outgoingRequests.push({ friendship: item, profile });
      }
    }

    const sortedAccepted = sortFriendsByPresence(acceptedProfiles, nowMs);
    const onlineCount = sortedAccepted.filter((friend) =>
      isUserCurrentlyOnline(friend, nowMs),
    ).length;

    return {
      friendships,
      profilesByUid,
      loading,
      error,
      nowMs,
      acceptedFriends: sortedAccepted,
      onlineCount,
      incomingRequests,
      outgoingRequests,
    };
  }, [uid, friendships, profilesByUid, loading, error, nowMs]);
}

function FriendAvatar({
  displayName,
  photoDataUrl,
  isOnline,
  showPresenceDot = true,
  size = 'md',
}: {
  displayName: string;
  photoDataUrl: string;
  isOnline?: boolean;
  showPresenceDot?: boolean;
  size?: 'sm' | 'md';
}) {
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    setImgBroken(false);
  }, [photoDataUrl]);

  const initials = getProfileInitials(displayName) || 'FO';
  const boxSize = size === 'sm' ? 'w-10 h-10' : 'w-12 h-12';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const dotSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <div className={`relative shrink-0 ${boxSize}`}>
      <div
        className={`${boxSize} rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border ${
          isOnline
            ? 'border-emerald-500/60 dark:border-emerald-400/60'
            : 'border-slate-200 dark:border-slate-700'
        } flex items-center justify-center shadow-xs`}
      >
        {photoDataUrl && !imgBroken ? (
          <img
            src={photoDataUrl}
            alt={`Foto de ${displayName}`}
            referrerPolicy="no-referrer"
            onError={() => setImgBroken(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span
            className={`${textSize} font-bold tracking-tight text-indigo-600 dark:text-indigo-300 select-none`}
          >
            {initials}
          </span>
        )}
      </div>

      {showPresenceDot && (
        <span
          aria-label={isOnline ? 'Online agora' : 'Offline'}
          title={isOnline ? 'Online agora' : 'Offline'}
          className={`absolute -bottom-0.5 -right-0.5 ${dotSize} rounded-full border-2 border-white dark:border-slate-900 ${
            isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          {isOnline && (
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
          )}
        </span>
      )}
    </div>
  );
}

interface FriendsTabProps {
  currentUser: FirebaseUser | null;
  myDisplayName: string;
  myPhotoDataUrl: string | null;
  myTotalXp: number;
  friendsData: FriendsDataState;
  onGoToAccountSetup: () => void;
  onNotify?: (message: string) => void;
}

export function FriendsTab({
  currentUser,
  myDisplayName,
  myPhotoDataUrl,
  myTotalXp,
  friendsData,
  onGoToAccountSetup,
  onNotify,
}: FriendsTabProps) {
  const [codeInput, setCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [busyPairId, setBusyPairId] = useState<string | null>(null);
  const [confirmRemovePairId, setConfirmRemovePairId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const myLevel = getLevelProgress(myTotalXp);

  if (!currentUser) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        aria-label="Aba de amigos"
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-8 text-center max-w-xl mx-auto space-y-4"
      >
        <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
          <Users className="w-6 h-6" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Entre na sua conta para ver seus amigos
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Com uma conta conectada você ganha um código exclusivo para adicionar amigos, ver quem está online agora e acompanhar foto e nível de XP de cada pessoa.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToAccountSetup}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Ir para Meu Perfil e entrar</span>
        </button>
      </motion.section>
    );
  }

  const myFriendCode = deriveFriendCode(currentUser.uid);
  const myResolvedPhoto = myPhotoDataUrl || currentUser.photoURL || '';
  const myResolvedName = myDisplayName.trim() || currentUser.displayName || 'Você';

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(myFriendCode);
      setCopiedCode(true);
      onNotify?.(`Código ${myFriendCode} copiado!`);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopiedCode(false);
      }, 2000);
    } catch {
      setActionMessage({
        type: 'error',
        text: `Seu código é ${myFriendCode}. Copie manualmente acima.`,
      });
    }
  }

  async function handleAddFriendSubmit(e: FormEvent) {
    e.preventDefault();
    if (!currentUser) return;

    const cleanCode = normalizeFriendCode(codeInput);
    setActionMessage(null);

    if (!isValidFriendCodeFormat(cleanCode)) {
      setActionMessage({
        type: 'error',
        text: 'Digite um código válido com 6 a 10 letras/números.',
      });
      return;
    }

    if (cleanCode === myFriendCode) {
      setActionMessage({
        type: 'error',
        text: 'Esse é o seu próprio código. Compartilhe-o com seus amigos!',
      });
      return;
    }

    setSubmittingCode(true);
    try {
      const target = await lookupUserByFriendCode(cleanCode);
      if (!target) {
        setActionMessage({
          type: 'error',
          text: 'Nenhum usuário encontrado com esse código.',
        });
        return;
      }

      if (target.uid === currentUser.uid) {
        setActionMessage({
          type: 'error',
          text: 'Você não pode adicionar a si mesmo.',
        });
        return;
      }

      const outcome = await sendFriendRequest(
        currentUser.uid,
        target.uid,
        friendsData.friendships,
      );

      if (outcome === 'already-friends') {
        setActionMessage({
          type: 'success',
          text: `Você e ${target.displayName} já são amigos!`,
        });
      } else if (outcome === 'already-sent') {
        setActionMessage({
          type: 'success',
          text: `Você já enviou um pedido para ${target.displayName}.`,
        });
      } else if (outcome === 'accepted-mutual') {
        setCodeInput('');
        const msg = `${target.displayName} já tinha te convidado! Amizade aceita.`;
        setActionMessage({ type: 'success', text: msg });
        onNotify?.(msg);
      } else {
        setCodeInput('');
        const msg = `Pedido de amizade enviado para ${target.displayName}!`;
        setActionMessage({ type: 'success', text: msg });
        onNotify?.(msg);
      }
    } catch {
      setActionMessage({
        type: 'error',
        text: 'Não foi possível enviar o pedido agora. Verifique sua conexão.',
      });
    } finally {
      setSubmittingCode(false);
    }
  }

  async function handleAccept(pairId: string, name: string) {
    if (!currentUser) return;
    setBusyPairId(pairId);
    setActionMessage(null);
    try {
      await acceptFriendRequest(currentUser.uid, pairId);
      const msg = `${name} agora está na sua lista de amigos!`;
      setActionMessage({ type: 'success', text: msg });
      onNotify?.(msg);
    } catch {
      setActionMessage({
        type: 'error',
        text: 'Não foi possível aceitar o pedido agora.',
      });
    } finally {
      setBusyPairId(null);
    }
  }

  async function handleRemoveOrCancel(pairId: string, successText: string) {
    setBusyPairId(pairId);
    setActionMessage(null);
    try {
      await removeOrCancelFriendship(pairId);
      setConfirmRemovePairId(null);
      setActionMessage({ type: 'success', text: successText });
      onNotify?.(successText);
    } catch {
      setActionMessage({
        type: 'error',
        text: 'Não foi possível concluir essa ação agora.',
      });
    } finally {
      setBusyPairId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Row: My Code + Add Friend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* My Friend Code Card */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
          aria-label="Seu código de amigo"
          className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 flex flex-col justify-between gap-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <FriendAvatar
                displayName={myResolvedName}
                photoDataUrl={myResolvedPhoto}
                isOnline
                size="md"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {myResolvedName}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Online agora
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">·</span>
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">
                    Nível {myLevel.currentLevel.level} ({formatXp(myTotalXp)} XP)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Seu código de amigo
              </p>
              <p
                data-testid="my-friend-code"
                className="text-lg font-extrabold tracking-[0.18em] text-slate-900 dark:text-white font-mono mt-0.5 select-all"
              >
                {myFriendCode}
              </p>
            </div>

            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shrink-0"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </motion.button>
          </div>
        </motion.section>

        {/* Add Friend Form */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.05 }}
          aria-label="Adicionar amigo"
          className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 flex flex-col justify-between gap-4"
        >
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Adicionar amigo pelo código</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Peça o código de 8 dígitos do seu amigo para acompanhar quando ele estiver online, a foto e o nível de XP.
            </p>
          </div>

          <form onSubmit={handleAddFriendSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(normalizeFriendCode(e.target.value))}
              placeholder="Ex: A7K9P2QX"
              maxLength={10}
              aria-label="Código do amigo"
              className="flex-1 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-sm font-mono tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
            />
            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              disabled={submittingCode}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {submittingCode ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              <span>Adicionar amigo</span>
            </motion.button>
          </form>

          <AnimatePresence>
            {actionMessage && (
              <motion.p
                key={actionMessage.text}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                role={actionMessage.type === 'error' ? 'alert' : 'status'}
                className={`text-xs font-medium ${
                  actionMessage.type === 'error'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {actionMessage.text}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.section>
      </div>

      {/* Pending Friend Requests (Incoming + Outgoing) */}
      {(friendsData.incomingRequests.length > 0 || friendsData.outgoingRequests.length > 0) && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
          aria-label="Pedidos de amizade pendentes"
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Pedidos de amizade pendentes</span>
            </h3>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
              {friendsData.incomingRequests.length + friendsData.outgoingRequests.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {friendsData.incomingRequests.map(({ friendship, profile }) => {
              const name = profile?.displayName || 'Usuário Foco';
              const xp = profile?.totalXp ?? 0;
              const lvl = profile?.level ?? 1;
              const lvlTitle = profile?.levelTitle || 'Iniciante';
              const isBusy = busyPairId === friendship.pairId;

              return (
                <motion.div
                  key={friendship.pairId}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FriendAvatar
                      displayName={name}
                      photoDataUrl={profile?.photoDataUrl || ''}
                      showPresenceDot={false}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Nível {lvl} · {lvlTitle} · {formatXp(xp)} XP
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleAccept(friendship.pairId, name)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors cursor-pointer"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5" />
                      )}
                      <span>Aceitar</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        handleRemoveOrCancel(friendship.pairId, 'Pedido recusado.')
                      }
                      aria-label={`Recusar pedido de ${name}`}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}

            {friendsData.outgoingRequests.map(({ friendship, profile }) => {
              const name = profile?.displayName || 'Usuário convidado';
              const lvl = profile?.level ?? 1;
              const isBusy = busyPairId === friendship.pairId;

              return (
                <motion.div
                  key={friendship.pairId}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FriendAvatar
                      displayName={name}
                      photoDataUrl={profile?.photoDataUrl || ''}
                      showPresenceDot={false}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Convite enviado · Nível {lvl}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      handleRemoveOrCancel(friendship.pairId, 'Convite cancelado.')
                    }
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer shrink-0"
                  >
                    Cancelar
                  </button>
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* Accepted Friends List */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.08 }}
        aria-label="Lista de amigos"
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Seus Amigos</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Veja em tempo real quem está online agora, a foto e o nível de XP de cada amigo.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="tabular-nums">{friendsData.onlineCount} online</span>
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-slate-600 dark:text-slate-300 tabular-nums">
              {friendsData.acceptedFriends.length}{' '}
              {friendsData.acceptedFriends.length === 1 ? 'amigo' : 'amigos'}
            </span>
          </div>
        </div>

        {friendsData.error && (
          <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {friendsData.error}
          </p>
        )}

        {friendsData.loading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Carregando amigos…</span>
          </div>
        ) : friendsData.acceptedFriends.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-8 text-center space-y-2">
            <Sparkles className="w-6 h-6 text-indigo-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Você ainda não adicionou nenhum amigo
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Copie seu código <span className="font-mono font-bold">{myFriendCode}</span> e envie para alguém, ou cole o código de um amigo acima para acompanhar o progresso juntos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <AnimatePresence initial={false}>
              {friendsData.acceptedFriends.map((friend) => {
                const pairId =
                  currentUser.uid < friend.uid
                    ? `${currentUser.uid}_${friend.uid}`
                    : `${friend.uid}_${currentUser.uid}`;
                const online = isUserCurrentlyOnline(friend, friendsData.nowMs);
                const statusLabel = formatLastSeenPt(friend, friendsData.nowMs);
                const lvlProgress = getLevelProgress(friend.totalXp);
                const isRemoving = confirmRemovePairId === pairId;
                const isBusy = busyPairId === pairId;

                return (
                  <motion.article
                    key={friend.uid}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                    className={`rounded-xl border p-4 transition-colors space-y-3 ${
                      online
                        ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/15'
                        : 'border-slate-200/90 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FriendAvatar
                          displayName={friend.displayName}
                          photoDataUrl={friend.photoDataUrl}
                          isOnline={online}
                          size="md"
                        />
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {friend.displayName}
                          </h4>
                          <p
                            className={`text-xs font-medium flex items-center gap-1.5 mt-0.5 ${
                              online
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                online ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'
                              }`}
                            />
                            <span className="truncate">{statusLabel}</span>
                          </p>
                        </div>
                      </div>

                      {isRemoving ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleRemoveOrCancel(
                                pairId,
                                `${friend.displayName} removido dos amigos.`,
                              )
                            }
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-60 cursor-pointer"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmRemovePairId(null)}
                            className="px-2 py-1 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemovePairId(pairId)}
                          aria-label={`Remover ${friend.displayName}`}
                          title="Remover amigo"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Level & XP Bar */}
                    <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                          Nível {friend.level} · {friend.levelTitle}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
                          {formatXp(friend.totalXp)} XP
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-[width] duration-300"
                          style={{ width: `${Math.round(lvlProgress.progressPercent)}%` }}
                        />
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.section>
    </div>
  );
}
