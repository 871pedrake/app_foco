import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { AmbientAudioEngine } from './audio/ambientAudioEngine';
import { auth } from './cloud/firebase';
import {
  PRESENCE_HEARTBEAT_MS,
  markUserOffline,
  publishPublicProfileSnapshot,
} from './cloud/friends';
import { Header } from './components/Header';
import { ImpulseHistoryView } from './components/ImpulseHistoryView';
import { ImpulseModal } from './components/ImpulseModal';
import { JournalView } from './components/JournalView';
import { LevelsView } from './components/LevelsView';
import { OfflineIndicator } from './components/PWAInstallButton';
import { ProfileView } from './components/ProfileView';
import { TasksView } from './components/TasksView';
import { Toast } from './components/Toast';
import { VicesView, getViceBestDays } from './components/VicesView';
import {
  STORAGE_KEYS,
  type ActiveTaskTimer,
  type AudioStatusSnapshot,
  type CompletionLog,
  type DailyStatus,
  type ImpulseLog,
  type JournalEntry,
  type MainTab,
  type NavbarXpNotification,
  type Task,
  type TaskType,
  type UserProfile,
  type Vice,
} from './types/foco';
import {
  generateId,
  getCountdownToMidnight,
  getLocalTimeStr,
  getLocalTodayKey,
  shiftDateKey,
} from './utils/date';
import {
  addTaskState,
  applyRolloverIfNeeded,
  clearJournalWithXp,
  completeImpulseExercise,
  deleteImpulseEntry,
  deleteTaskWithXp,
  loadInitialFocoState,
  recordImpulseEntry,
  recordRelapseWithXp,
  sanitizeProfile,
  saveJournalWithXp,
  simulateNextDayState,
  syncHistoryForDate,
  toggleTaskWithXp,
  writeJsonStorage,
} from './utils/focoStorage';
import { LEVEL_DEFINITIONS, formatXp, hasJournalContent } from './utils/xp';

function getInitialDarkTheme(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    if (saved) return saved === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export default function App() {
  const initialStateRef = useRef<ReturnType<typeof loadInitialFocoState> | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = loadInitialFocoState();
  }

  const audioEngineRef = useRef<AmbientAudioEngine | null>(null);
  if (!audioEngineRef.current) {
    audioEngineRef.current = new AmbientAudioEngine();
  }

  const [activeTab, setActiveTab] = useState<MainTab>('tasks');
  const [isDark, setIsDark] = useState<boolean>(getInitialDarkTheme);
  const [tasks, setTasks] = useState<Task[]>(initialStateRef.current.tasks);
  const [historyByDate, setHistoryByDate] = useState<Record<string, DailyStatus>>(
    initialStateRef.current.historyByDate
  );
  const [completionLogs, setCompletionLogs] = useState<CompletionLog[]>(
    initialStateRef.current.completionLogs
  );
  const [totalXp, setTotalXp] = useState<number>(initialStateRef.current.totalXp);
  const [xpByDate, setXpByDate] = useState<Record<string, number>>(initialStateRef.current.xpByDate);
  const [journalEntries, setJournalEntries] = useState<Record<string, JournalEntry>>(
    initialStateRef.current.journalEntries
  );
  const [vices, setVices] = useState<Vice[]>(initialStateRef.current.vices);
  const [impulseLogs, setImpulseLogs] = useState<ImpulseLog[]>(initialStateRef.current.impulseLogs);
  const [impulseModalOpen, setImpulseModalOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(initialStateRef.current.profile);
  const [activeTimer, setActiveTimer] = useState<ActiveTaskTimer | null>(null);
  const [cloudUser, setCloudUser] = useState<FirebaseUser | null>(() => auth.currentUser);

  useEffect(() => onAuthStateChanged(auth, setCloudUser), []);

  // Refs mirror latest state so midnight rollover & timer completion evaluate synchronously & accurately
  const latestStateRef = useRef({
    tasks,
    completionLogs,
    historyByDate,
    journalEntries,
    vices,
    totalXp,
    xpByDate,
  });
  latestStateRef.current = {
    tasks,
    completionLogs,
    historyByDate,
    journalEntries,
    vices,
    totalXp,
    xpByDate,
  };

  const [audioStatus, setAudioStatus] = useState<AudioStatusSnapshot>(() =>
    audioEngineRef.current!.getSnapshot()
  );

  const [nowTick, setNowTick] = useState<Date>(() => new Date());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [xpNotice, setXpNotice] = useState<NavbarXpNotification | null>(null);
  const xpNoticeSeqRef = useRef(0);
  const xpNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impulseOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMsg(message);
    setToastVisible(true);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
    }, 2900);
  }, []);

  const triggerXpNotice = useCallback(
    (
      delta: number,
      source: 'task' | 'journal' | 'vice',
      leveledUpTo?: number | null,
      leveledDownTo?: number | null
    ) => {
      if (!delta) return;
      xpNoticeSeqRef.current += 1;
      setXpNotice({
        id: xpNoticeSeqRef.current,
        delta,
        source,
        leveledUpTo,
        leveledDownTo,
      });
      if (xpNoticeTimerRef.current) {
        clearTimeout(xpNoticeTimerRef.current);
      }
      xpNoticeTimerRef.current = setTimeout(() => {
        setXpNotice(null);
      }, 2400);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      if (xpNoticeTimerRef.current) {
        clearTimeout(xpNoticeTimerRef.current);
      }
      if (impulseOpenTimerRef.current) {
        clearTimeout(impulseOpenTimerRef.current);
      }
    };
  }, []);

  // Sync theme class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  }, [isDark]);

  // Publica perfil público, XP/nível e presença online em tempo real para amigos
  const presencePayloadRef = useRef({
    uid: cloudUser?.uid ?? '',
    displayName: profile.name,
    fallbackName: cloudUser?.displayName ?? cloudUser?.email?.split('@')[0] ?? 'Usuário Foco',
    photoDataUrl: profile.photoDataUrl,
    fallbackPhotoUrl: cloudUser?.photoURL ?? '',
    totalXp,
  });
  presencePayloadRef.current = {
    uid: cloudUser?.uid ?? '',
    displayName: profile.name,
    fallbackName: cloudUser?.displayName ?? cloudUser?.email?.split('@')[0] ?? 'Usuário Foco',
    photoDataUrl: profile.photoDataUrl,
    fallbackPhotoUrl: cloudUser?.photoURL ?? '',
    totalXp,
  };

  useEffect(() => {
    const uid = cloudUser?.uid;
    if (!uid) return;

    const publishOnlineIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const snap = presencePayloadRef.current;
      if (!snap.uid) return;
      void publishPublicProfileSnapshot({
        ...snap,
        isOnline: true,
      }).catch(() => undefined);
    };

    const debounceTimer = setTimeout(publishOnlineIfVisible, 350);
    return () => clearTimeout(debounceTimer);
  }, [cloudUser?.uid, profile.name, profile.photoDataUrl, totalXp]);

  useEffect(() => {
    const uid = cloudUser?.uid;
    if (!uid) return;

    const publishOnline = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const snap = presencePayloadRef.current;
      if (!snap.uid) return;
      void publishPublicProfileSnapshot({
        ...snap,
        isOnline: true,
      }).catch(() => undefined);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void markUserOffline(uid).catch(() => undefined);
      } else {
        publishOnline();
      }
    };

    const handlePageHide = () => {
      void markUserOffline(uid).catch(() => undefined);
    };

    const heartbeat = setInterval(publishOnline, PRESENCE_HEARTBEAT_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [cloudUser?.uid]);

  // Subscribe to audio engine + unlock on first user interaction + dispose on unmount
  useEffect(() => {
    const engine = audioEngineRef.current!;
    const unsubscribe = engine.subscribe((snap) => {
      setAudioStatus(snap);
    });

    engine.startIfEnabled();

    const handleFirstGesture = () => {
      engine.unlock();
    };
    window.addEventListener('pointerdown', handleFirstGesture, { once: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true });

    // Som de clique em botões, abas, links e caixas de seleção
    const handleClickSound = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const el = target?.closest?.(
        'button, a[href], [role="button"], [role="tab"], summary, select, input[type="checkbox"], input[type="radio"], label[for]'
      ) as HTMLElement | null;
      if (!el) return;
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;
      if (el.closest('[data-no-click-sound]')) return;
      const isToggle =
        (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) ||
        el.getAttribute('role') === 'switch' ||
        el.classList.contains('task-checkbox');
      engine.playClick(isToggle ? 'toggle' : 'tap');
    };
    document.addEventListener('click', handleClickSound, true);

    return () => {
      unsubscribe();
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      document.removeEventListener('click', handleClickSound, true);
      engine.dispose();
    };
  }, []);

  // Clock tick & automatic midnight daily-reset + XP day-close evaluation
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setNowTick(now);
      const todayKey = getLocalTodayKey(now);
      const lastActive = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_DAY);
      if (lastActive && lastActive !== todayKey) {
        const snap = latestStateRef.current;
        const rolled = applyRolloverIfNeeded(snap.tasks, snap.historyByDate, lastActive, todayKey, {
          journalEntries: snap.journalEntries,
          vices: snap.vices,
          totalXp: snap.totalXp,
          xpByDate: snap.xpByDate,
        });

        setTasks(rolled.tasks);
        setHistoryByDate(rolled.historyByDate);
        setTotalXp(rolled.totalXp);
        setXpByDate(rolled.xpByDate);

        writeJsonStorage(STORAGE_KEYS.TASKS, rolled.tasks);
        writeJsonStorage(STORAGE_KEYS.HISTORY, rolled.historyByDate);
        writeJsonStorage(STORAGE_KEYS.TOTAL_XP, rolled.totalXp);
        writeJsonStorage(STORAGE_KEYS.XP_BY_DATE, rolled.xpByDate);
        localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_DAY, todayKey);

        const net = rolled.totalXp - snap.totalXp;
        if (net !== 0) {
          showToast(
            `Novo dia! Vícios limpos e falhas ajustados (${net > 0 ? `+${formatXp(net)}` : formatXp(net)} XP).`
          );
        } else {
          showToast('Novo dia iniciado! Habilidades diárias resetadas.');
        }
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [showToast]);

  const finishTaskFromTimer = useCallback(
    (taskId: string) => {
      const snap = latestStateRef.current;
      const todayKey = getLocalTodayKey();
      const timeNow = getLocalTimeStr();
      const res = toggleTaskWithXp({
        tasks: snap.tasks,
        completionLogs: snap.completionLogs,
        historyByDate: snap.historyByDate,
        totalXp: snap.totalXp,
        xpByDate: snap.xpByDate,
        taskId,
        todayKey,
        timeNow,
        fromTimer: true,
      });

      if (!res.toggledTask || !res.didComplete) return;

      setTasks(res.tasks);
      setCompletionLogs(res.completionLogs);
      setHistoryByDate(res.historyByDate);
      setTotalXp(res.totalXp);
      setXpByDate(res.xpByDate);

      writeJsonStorage(STORAGE_KEYS.TASKS, res.tasks);
      writeJsonStorage(STORAGE_KEYS.COMPLETION_LOGS, res.completionLogs);
      writeJsonStorage(STORAGE_KEYS.HISTORY, res.historyByDate);
      writeJsonStorage(STORAGE_KEYS.TOTAL_XP, res.totalXp);
      writeJsonStorage(STORAGE_KEYS.XP_BY_DATE, res.xpByDate);

      if (res.xpDelta !== 0) {
        triggerXpNotice(res.xpDelta, 'task', res.leveledUpTo, null);
      }

      audioEngineRef.current?.playScorePoint();
      if (res.leveledUpTo) {
        const lvlObj = LEVEL_DEFINITIONS.find((l) => l.level === res.leveledUpTo);
        showToast(
          lvlObj
            ? `Tempo concluído! "${res.toggledTask.title}" finalizada · Nível ${lvlObj.level}: ${lvlObj.title}! (+1 XP)`
            : `Tempo concluído! "${res.toggledTask.title}" finalizada · Nível ${res.leveledUpTo}! (+1 XP)`
        );
      } else {
        showToast(`Tempo concluído! "${res.toggledTask.title}" finalizada (+1 XP)`);
      }
    },
    [showToast, triggerXpNotice]
  );

  // Drift-free countdown tick for active task timer (persists across tab switches)
  useEffect(() => {
    if (!activeTimer || !activeTimer.isRunning || !activeTimer.endTimeMs) return;

    const interval = setInterval(() => {
      setActiveTimer((prev) => {
        if (!prev || !prev.isRunning || !prev.endTimeMs) return prev;
        const remaining = Math.max(0, Math.ceil((prev.endTimeMs - Date.now()) / 1000));
        if (remaining <= 0) {
          queueMicrotask(() => finishTaskFromTimer(prev.taskId));
          return null;
        }
        if (remaining === prev.remainingSeconds) return prev;
        return { ...prev, remainingSeconds: remaining };
      });
    }, 250);

    return () => clearInterval(interval);
  }, [activeTimer?.isRunning, activeTimer?.endTimeMs, activeTimer?.taskId, finishTaskFromTimer]);

  const currentTodayKey = getLocalTodayKey(nowTick);
  const headerDateText = nowTick.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const countdown = getCountdownToMidnight(nowTick);
  const resetCountdownText = `Próximo reset das diárias em ${countdown.hours}h ${String(
    countdown.minutes
  ).padStart(2, '0')}m`;

  function handleStartTaskTimer(taskId: string, overrideTasks?: Task[]) {
    const pool = overrideTasks || tasks;
    const target = pool.find((t) => t.id === taskId);
    if (!target || target.completed || !target.timerMinutes || target.timerMinutes <= 0) return;

    const totalSeconds = Math.floor(target.timerMinutes * 60);
    setActiveTimer({
      taskId: target.id,
      totalSeconds,
      remainingSeconds: totalSeconds,
      endTimeMs: Date.now() + totalSeconds * 1000,
      isRunning: true,
    });
  }

  function handleTogglePauseTaskTimer() {
    setActiveTimer((prev) => {
      if (!prev) return null;
      if (prev.isRunning) {
        const remaining = prev.endTimeMs
          ? Math.max(1, Math.ceil((prev.endTimeMs - Date.now()) / 1000))
          : prev.remainingSeconds;
        return {
          ...prev,
          remainingSeconds: remaining,
          endTimeMs: null,
          isRunning: false,
        };
      }
      return {
        ...prev,
        endTimeMs: Date.now() + prev.remainingSeconds * 1000,
        isRunning: true,
      };
    });
  }

  function handleResetTaskTimer() {
    setActiveTimer((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        remainingSeconds: prev.totalSeconds,
        endTimeMs: null,
        isRunning: false,
      };
    });
  }

  function handleCancelTaskTimer() {
    setActiveTimer(null);
  }

  // Task & XP handlers
  function handleAddTask(title: string, type: TaskType, timerMinutes?: number | null) {
    const todayKey = getLocalTodayKey();
    const res = addTaskState({
      tasks,
      historyByDate,
      title,
      type,
      todayKey,
      timerMinutes,
    });
    if (!res.addedTask) return;

    setTasks(res.tasks);
    setHistoryByDate(res.historyByDate);
    writeJsonStorage(STORAGE_KEYS.TASKS, res.tasks);
    writeJsonStorage(STORAGE_KEYS.HISTORY, res.historyByDate);
    audioEngineRef.current?.playScorePoint();

    if (res.addedTask.timerMinutes && res.addedTask.timerMinutes > 0) {
      if (!activeTimer) {
        handleStartTaskTimer(res.addedTask.id, res.tasks);
        showToast(
          `Cronômetro de ${res.addedTask.timerMinutes} min iniciado! Ganhe +1 XP ao acabar o tempo.`
        );
      } else {
        showToast(
          `Tarefa com tempo (${res.addedTask.timerMinutes} min) adicionada!`
        );
      }
    } else {
      showToast(type === 'daily' ? 'Habilidade diária adicionada' : 'Habilidade única adicionada');
    }
  }

  function handleToggleTask(taskId: string) {
    const todayKey = getLocalTodayKey();
    const timeNow = getLocalTimeStr();
    const res = toggleTaskWithXp({
      tasks,
      completionLogs,
      historyByDate,
      totalXp,
      xpByDate,
      taskId,
      todayKey,
      timeNow,
    });
    if (!res.toggledTask) return;

    if (!res.didComplete && res.xpDelta === 0 && res.toggledTask.timerMinutes) {
      handleStartTaskTimer(taskId);
      showToast(
        `Esta tarefa usa cronômetro (${res.toggledTask.timerMinutes} min). O +1 XP entra quando o tempo acabar.`
      );
      return;
    }

    setTasks(res.tasks);
    setCompletionLogs(res.completionLogs);
    setHistoryByDate(res.historyByDate);
    setTotalXp(res.totalXp);
    setXpByDate(res.xpByDate);

    writeJsonStorage(STORAGE_KEYS.TASKS, res.tasks);
    writeJsonStorage(STORAGE_KEYS.COMPLETION_LOGS, res.completionLogs);
    writeJsonStorage(STORAGE_KEYS.HISTORY, res.historyByDate);
    writeJsonStorage(STORAGE_KEYS.TOTAL_XP, res.totalXp);
    writeJsonStorage(STORAGE_KEYS.XP_BY_DATE, res.xpByDate);

    if (res.xpDelta !== 0) {
      triggerXpNotice(res.xpDelta, 'task', res.leveledUpTo, res.leveledDownTo);
    }

    if (res.didComplete) {
      audioEngineRef.current?.playScorePoint();
      if (res.leveledUpTo) {
        const lvlObj = LEVEL_DEFINITIONS.find((l) => l.level === res.leveledUpTo);
        showToast(
          lvlObj
            ? `Subiu para o Nível ${lvlObj.level}: ${lvlObj.title}! (+1 XP)`
            : `Subiu para o Nível ${res.leveledUpTo}! (+1 XP)`
        );
      } else {
        showToast(`+1 XP ganho às ${timeNow}`);
      }
    } else {
      audioEngineRef.current?.playUncheckPoint();
      showToast(
        res.leveledDownTo
          ? `Conclusão desfeita (-1 XP · Voltou ao Nível ${res.leveledDownTo})`
          : 'Conclusão desfeita (-1 XP)'
      );
    }
  }

  function handleUpdateTaskTitle(taskId: string, nextTitle: string) {
    const clean = nextTitle.trim();
    if (!clean) return;
    const nextTasks = tasks.map((t) => (t.id === taskId ? { ...t, title: clean } : t));
    setTasks(nextTasks);
    writeJsonStorage(STORAGE_KEYS.TASKS, nextTasks);
  }

  function handleDeleteTask(taskId: string) {
    const todayKey = getLocalTodayKey();
    const res = deleteTaskWithXp({
      tasks,
      completionLogs,
      historyByDate,
      totalXp,
      xpByDate,
      taskId,
      todayKey,
    });
    if (!res.deletedTask) return;

    if (activeTimer?.taskId === taskId) {
      setActiveTimer(null);
    }

    setTasks(res.tasks);
    setCompletionLogs(res.completionLogs);
    setHistoryByDate(res.historyByDate);
    setTotalXp(res.totalXp);
    setXpByDate(res.xpByDate);

    writeJsonStorage(STORAGE_KEYS.TASKS, res.tasks);
    writeJsonStorage(STORAGE_KEYS.COMPLETION_LOGS, res.completionLogs);
    writeJsonStorage(STORAGE_KEYS.HISTORY, res.historyByDate);
    writeJsonStorage(STORAGE_KEYS.TOTAL_XP, res.totalXp);
    writeJsonStorage(STORAGE_KEYS.XP_BY_DATE, res.xpByDate);

    if (res.xpDelta !== 0) {
      triggerXpNotice(res.xpDelta, 'task', null, res.leveledDownTo);
      audioEngineRef.current?.playUncheckPoint();
      showToast(
        res.leveledDownTo
          ? `Habilidade removida (-1 XP · Voltou ao Nível ${res.leveledDownTo})`
          : 'Habilidade removida (-1 XP)'
      );
    } else {
      showToast('Habilidade removida');
    }
  }

  function handleClearCompleted() {
    const clearedIds = new Set(tasks.filter((t) => t.completed).map((t) => t.id));
    if (clearedIds.size === 0) return;
    const todayKey = getLocalTodayKey();
    const nextTasks = tasks.filter((t) => !t.completed);
    const nextLogs = completionLogs.map((log) =>
      clearedIds.has(log.taskId) && log.dateKey === todayKey ? { ...log, preserved: true } : log
    );
    const nextHistory = syncHistoryForDate(nextTasks, historyByDate, todayKey);
    setTasks(nextTasks);
    setCompletionLogs(nextLogs);
    setHistoryByDate(nextHistory);
    writeJsonStorage(STORAGE_KEYS.TASKS, nextTasks);
    writeJsonStorage(STORAGE_KEYS.COMPLETION_LOGS, nextLogs);
    writeJsonStorage(STORAGE_KEYS.HISTORY, nextHistory);
    showToast('Concluídas limpas (XP preservado)');
  }

  function handleSimulateDay() {
    const todayKey = getLocalTodayKey();
    const sim = simulateNextDayState({
      tasks,
      historyByDate,
      completionLogs,
      impulseLogs,
      journalEntries,
      vices,
      totalXp,
      xpByDate,
      todayKey,
    });

    setTasks(sim.tasks);
    setHistoryByDate(sim.historyByDate);
    setCompletionLogs(sim.completionLogs);
    setImpulseLogs(sim.impulseLogs);
    setJournalEntries(sim.journalEntries);
    setVices(sim.vices);
    setTotalXp(sim.totalXp);
    setXpByDate(sim.xpByDate);

    writeJsonStorage(STORAGE_KEYS.TASKS, sim.tasks);
    writeJsonStorage(STORAGE_KEYS.HISTORY, sim.historyByDate);
    writeJsonStorage(STORAGE_KEYS.COMPLETION_LOGS, sim.completionLogs);
    writeJsonStorage(STORAGE_KEYS.IMPULSE_LOGS, sim.impulseLogs);
    writeJsonStorage(STORAGE_KEYS.JOURNAL, sim.journalEntries);
    writeJsonStorage(STORAGE_KEYS.VICES, sim.vices);
    writeJsonStorage(STORAGE_KEYS.TOTAL_XP, sim.totalXp);
    writeJsonStorage(STORAGE_KEYS.XP_BY_DATE, sim.xpByDate);

    const { cleanViceCount, gainedXp, lostXp } = sim.dayCloseReport;
    if (sim.xpDeltaApplied >= 0) {
      audioEngineRef.current?.playScorePoint();
    } else {
      audioEngineRef.current?.playUncheckPoint();
    }
    showToast(
      `Novo dia! Vícios limpos (${cleanViceCount}): +${formatXp(gainedXp)} XP · Falhas: -${formatXp(lostXp)} XP.`
    );
  }

  // Journal handlers (+1 XP on first save for a day, -1 XP if emptied/cleared)
  function handleSaveJournalEntry(dateKey: string, entry: JournalEntry) {
    const res = saveJournalWithXp({
      journalEntries,
      totalXp,
      xpByDate,
      dateKey,
      entry,
    });

    setJournalEntries(res.journalEntries);
    setTotalXp(res.totalXp);
    setXpByDate(res.xpByDate);

    writeJsonStorage(STORAGE_KEYS.JOURNAL, res.journalEntries);
    writeJsonStorage(STORAGE_KEYS.TOTAL_XP, res.totalXp);
    writeJsonStorage(STORAGE_KEYS.XP_BY_DATE, res.xpByDate);

    if (res.xpDelta !== 0) {
      triggerXpNotice(res.xpDelta, 'journal', res.leveledUpTo, res.leveledDownTo);
    }

    if (res.xpDelta > 0) {
      audioEngineRef.current?.playScorePoint();
      if (res.leveledUpTo) {
        const lvlObj = LEVEL_DEFINITIONS.find((l) => l.level === res.leveledUpTo);
        showToast(
          lvlObj
            ? `Diário salvo! Subiu para o Nível ${lvlObj.level}: ${lvlObj.title}! (+1 XP)`
            : `Diário salvo e subiu para o Nível ${res.leveledUpTo}! (+1 XP)`
        );
      } else {
        showToast('Entrada do diário salva (+1 XP)');
      }
    } else if (res.xpDelta < 0) {
      audioEngineRef.current?.playUncheckPoint();
      showToast(
        res.leveledDownTo
          ? `Entrada vazia salva (-1 XP · Voltou ao Nível ${res.leveledDownTo})`
          : 'Entrada vazia salva (-1 XP)'
      );
    } else {
      audioEngineRef.current?.playScorePoint();
      showToast('Entrada do diário atualizada');
    }
  }

  function handleClearJournalEntry(dateKey: string) {
    const res = clearJournalWithXp({
      journalEntries,
      totalXp,
      xpByDate,
      dateKey,
    });

    setJournalEntries(res.journalEntries);
    setTotalXp(res.totalXp);
    setXpByDate(res.xpByDate);

    writeJsonStorage(STORAGE_KEYS.JOURNAL, res.journalEntries);
    writeJsonStorage(STORAGE_KEYS.TOTAL_XP, res.totalXp);
    writeJsonStorage(STORAGE_KEYS.XP_BY_DATE, res.xpByDate);

    if (res.xpDelta !== 0) {
      triggerXpNotice(res.xpDelta, 'journal', null, res.leveledDownTo);
    }

    if (res.xpDelta < 0) {
      audioEngineRef.current?.playUncheckPoint();
      showToast(
        res.leveledDownTo
          ? `Entrada limpa (-1 XP · Voltou ao Nível ${res.leveledDownTo})`
          : 'Entrada limpa (-1 XP)'
      );
    } else {
      showToast('Entrada limpa');
    }
  }

  // Vice handlers (-0.5 XP immediately on relapse, +1 XP per clean vice at day close)
  function handleAddVice(name: string, initialCleanDays: number) {
    const todayKey = getLocalTodayKey();
    const safeDays = Number.isFinite(initialCleanDays)
      ? Math.min(3650, Math.max(0, Math.floor(initialCleanDays)))
      : 0;
    const newVice: Vice = {
      id: generateId(),
      name,
      streakStartKey: shiftDateKey(todayKey, -safeDays),
      bestStreak: safeDays,
      relapses: [],
    };
    const next = [newVice, ...vices];
    setVices(next);
    writeJsonStorage(STORAGE_KEYS.VICES, next);
    audioEngineRef.current?.playScorePoint();
    showToast('Novo vício adicionado ao rastreamento');
  }

  function handleDeleteVice(viceId: string) {
    const next = vices.filter((v) => v.id !== viceId);
    setVices(next);
    writeJsonStorage(STORAGE_KEYS.VICES, next);
    showToast('Vício removido');
  }

  function handleRecordRelapse(viceId: string, trigger: string, comment: string = ''): string {
    const todayKey = getLocalTodayKey();
    const timeNow = getLocalTimeStr();
    const res = recordRelapseWithXp({
      vices,
      totalXp,
      xpByDate,
      viceId,
      trigger,
      comment,
      todayKey,
      timeNow,
      getBestDays: getViceBestDays,
    });

    setVices(res.vices);
    setTotalXp(res.totalXp);
    setXpByDate(res.xpByDate);

    writeJsonStorage(STORAGE_KEYS.VICES, res.vices);
    writeJsonStorage(STORAGE_KEYS.TOTAL_XP, res.totalXp);
    writeJsonStorage(STORAGE_KEYS.XP_BY_DATE, res.xpByDate);

    if (res.xpDelta !== 0) {
      triggerXpNotice(res.xpDelta, 'vice', null, res.leveledDownTo);
    }

    audioEngineRef.current?.playUncheckPoint();
    const levelSuffix = res.leveledDownTo ? ` · Voltou ao Nível ${res.leveledDownTo}` : '';
    showToast(
      comment.trim()
        ? `Recaída e comentário salvos (-0,5 XP${levelSuffix}). Melhor sequência preservada.`
        : `Recaída registrada (-0,5 XP${levelSuffix}). Melhor sequência preservada.`
    );
    return res.logId;
  }

  function handleSaveSlipReflection(
    viceId: string,
    logId: string,
    trigger: string,
    context: string,
    plan: string
  ) {
    const next = vices.map((v) => {
      if (v.id !== viceId) return v;
      return {
        ...v,
        relapses: v.relapses.map((r) =>
          r.id === logId ? { ...r, trigger, context, plan } : r
        ),
      };
    });
    setVices(next);
    writeJsonStorage(STORAGE_KEYS.VICES, next);
    audioEngineRef.current?.playScorePoint();
    showToast('Comentário e reflexão salvos!');
  }

  function handleUpdateRelapseComment(viceId: string, logId: string, comment: string) {
    const cleanComment = comment.trim();
    const next = vices.map((v) => {
      if (v.id !== viceId) return v;
      return {
        ...v,
        relapses: v.relapses.map((r) =>
          r.id === logId ? { ...r, context: cleanComment } : r
        ),
      };
    });
    setVices(next);
    writeJsonStorage(STORAGE_KEYS.VICES, next);
    audioEngineRef.current?.playScorePoint();
    showToast('Comentário salvo!');
  }

  function handleSaveProfile(nextProfile: UserProfile, toastMessage?: string) {
    const clean = sanitizeProfile(nextProfile);
    setProfile(clean);
    writeJsonStorage(STORAGE_KEYS.PROFILE, clean);
    audioEngineRef.current?.playScorePoint();
    showToast(toastMessage || 'Perfil atualizado!');
  }

  function handleResetXp() {
    const todayKey = getLocalTodayKey();
    const resetTasks = tasks.map((t) => ({
      ...t,
      completed: false,
      completedDate: null,
      completedTime: null,
      completions: 0,
    }));
    const resetHistory = syncHistoryForDate(resetTasks, {}, todayKey);

    setTasks(resetTasks);
    setCompletionLogs([]);
    setHistoryByDate(resetHistory);
    setTotalXp(0);
    setXpByDate({});
    setXpNotice(null);
    setActiveTimer(null);

    writeJsonStorage(STORAGE_KEYS.TASKS, resetTasks);
    writeJsonStorage(STORAGE_KEYS.COMPLETION_LOGS, []);
    writeJsonStorage(STORAGE_KEYS.HISTORY, resetHistory);
    writeJsonStorage(STORAGE_KEYS.TOTAL_XP, 0);
    writeJsonStorage(STORAGE_KEYS.XP_BY_DATE, {});

    audioEngineRef.current?.playUncheckPoint();
    showToast('XP zerado! Voltou para o Nível 1.');
  }

  // Impulse (Rocket) handlers — strictly 0 XP
  function handleRecordImpulseThought(thought: string): ImpulseLog | null {
    const todayKey = getLocalTodayKey();
    const timeNow = getLocalTimeStr();
    const res = recordImpulseEntry({
      logs: impulseLogs,
      thought,
      dateKey: todayKey,
      timeStr: timeNow,
    });
    if (!res.createdLog) return null;
    setImpulseLogs(res.logs);
    writeJsonStorage(STORAGE_KEYS.IMPULSE_LOGS, res.logs);
    return res.createdLog;
  }

  function handleCompleteImpulseExercise(
    logId: string,
    actionTaken: string,
    breathingCycles: number,
    completedExercise: boolean
  ) {
    const next = completeImpulseExercise({
      logs: impulseLogs,
      logId,
      actionTaken,
      breathingCycles,
      completedExercise,
    });
    setImpulseLogs(next);
    writeJsonStorage(STORAGE_KEYS.IMPULSE_LOGS, next);
    audioEngineRef.current?.playScorePoint();
    showToast('Impulso freado! Salvo no Histórico do Impulso (0 XP).');
  }

  function handleDeleteImpulseLog(logId: string) {
    const next = deleteImpulseEntry({ logs: impulseLogs, logId });
    setImpulseLogs(next);
    writeJsonStorage(STORAGE_KEYS.IMPULSE_LOGS, next);
    showToast('Registro de impulso removido');
  }

  function handleOpenImpulse() {
    audioEngineRef.current?.playRocketLaunch();
    if (impulseOpenTimerRef.current) {
      clearTimeout(impulseOpenTimerRef.current);
    }
    impulseOpenTimerRef.current = setTimeout(() => {
      impulseOpenTimerRef.current = null;
      setImpulseModalOpen(true);
    }, 220);
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        headerDateText={headerDateText}
        resetCountdownText={resetCountdownText}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
        onSimulateDay={handleSimulateDay}
        audioStatus={audioStatus}
        onToggleMusic={() => {
          const next = audioEngineRef.current!.toggleMusic();
          showToast(
            next
              ? `Tocando: ${audioEngineRef.current!.getSnapshot().currentSong.title}`
              : 'Música pausada'
          );
        }}
        onToggleRain={() => {
          const next = audioEngineRef.current!.toggleRain();
          const sc = audioEngineRef.current!.getSnapshot().currentSoundscape;
          showToast(next ? `Ambiente: ${sc.title}` : 'Som ambiente pausado');
        }}
        onToggleSfx={() => {
          const next = !audioStatus.sfxEnabled;
          audioEngineRef.current!.setSfxEnabled(next);
          if (next) {
            audioEngineRef.current!.playScorePoint();
            showToast('Efeitos sonoros ativados');
          } else {
            showToast('Efeitos sonoros silenciados');
          }
        }}
        onNextRandomSong={() => {
          const nextSong = audioEngineRef.current!.nextRandomSong();
          showToast(`Música aleatória: ${nextSong.title}`);
        }}
        onSelectSong={(index) => {
          const song = audioEngineRef.current!.selectSong(index);
          showToast(`Tocando: ${song.title}`);
        }}
        onNextRandomSoundscape={() => {
          const nextSc = audioEngineRef.current!.nextRandomSoundscape();
          showToast(`Ambiente aleatório: ${nextSc.title}`);
        }}
        onSelectSoundscape={(index) => {
          const sc = audioEngineRef.current!.selectSoundscape(index);
          showToast(`Ambiente: ${sc.title}`);
        }}
        onRandomizeAll={() => {
          const res = audioEngineRef.current!.randomizeAll();
          showToast(`${res.song.title} · ${res.soundscape.title}`);
        }}
        onChangeMusicVolume={(v) => audioEngineRef.current!.setMusicVolume(v)}
        onChangeRainVolume={(v) => audioEngineRef.current!.setRainVolume(v)}
        onUploadCustomMusic={(file) => {
          audioEngineRef.current!.setCustomAudioFile(file);
          showToast(`Tocando: ${file.name}`);
        }}
        onClearCustomMusic={() => {
          audioEngineRef.current!.clearCustomAudioFile();
          showToast('Voltando às 5 músicas relaxantes aleatórias');
        }}
        totalXp={totalXp}
        xpNotice={xpNotice}
        profile={profile}
        onOpenImpulse={handleOpenImpulse}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 flex flex-col"
        >
          {activeTab === 'tasks' && (
            <TasksView
              tasks={tasks}
              historyByDate={historyByDate}
              completionLogs={completionLogs}
              totalXp={totalXp}
              xpByDate={xpByDate}
              todayKey={currentTodayKey}
              activeTimer={activeTimer}
              onAddTask={handleAddTask}
              onToggleTask={handleToggleTask}
              onUpdateTaskTitle={handleUpdateTaskTitle}
              onDeleteTask={handleDeleteTask}
              onClearCompleted={handleClearCompleted}
              onOpenLevels={() => setActiveTab('levels')}
              onStartTimer={handleStartTaskTimer}
              onTogglePauseTimer={handleTogglePauseTaskTimer}
              onResetTimer={handleResetTaskTimer}
              onCancelTimer={handleCancelTaskTimer}
            />
          )}

          {activeTab === 'levels' && (
            <LevelsView
              tasks={tasks}
              completionLogs={completionLogs}
              totalXp={totalXp}
              xpByDate={xpByDate}
              todayKey={currentTodayKey}
              onGoToTasks={() => setActiveTab('tasks')}
              onResetXp={handleResetXp}
            />
          )}

          {activeTab === 'journal' && (
            <JournalView
              entries={journalEntries}
              todayKey={currentTodayKey}
              onSaveEntry={handleSaveJournalEntry}
              onClearEntry={handleClearJournalEntry}
              onClose={() => setActiveTab('tasks')}
            />
          )}

          {activeTab === 'vices' && (
            <VicesView
              vices={vices}
              todayKey={currentTodayKey}
              onAddVice={handleAddVice}
              onDeleteVice={handleDeleteVice}
              onRecordRelapse={handleRecordRelapse}
              onSaveSlipReflection={handleSaveSlipReflection}
              onUpdateRelapseComment={handleUpdateRelapseComment}
            />
          )}

          {activeTab === 'impulseHistory' && (
            <ImpulseHistoryView
              logs={impulseLogs}
              todayKey={currentTodayKey}
              onTriggerImpulse={handleOpenImpulse}
              onDeleteLog={handleDeleteImpulseLog}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView
              profile={profile}
              totalXp={totalXp}
              tasksCompletedCount={tasks.reduce((acc, t) => acc + t.completions, 0)}
              journalDaysCount={
                Object.values(journalEntries).filter((entry) => hasJournalContent(entry)).length
              }
              vicesCount={vices.length}
              onSaveProfile={handleSaveProfile}
              onNotify={showToast}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <ImpulseModal
        open={impulseModalOpen}
        onClose={() => setImpulseModalOpen(false)}
        onRecordThought={handleRecordImpulseThought}
        onCompleteExercise={handleCompleteImpulseExercise}
        onOpenHistory={() => setActiveTab('impulseHistory')}
      />

      <Toast message={toastMsg} visible={toastVisible} />
      <OfflineIndicator />
      </div>
    </MotionConfig>
  );
}
