import {
  STORAGE_KEYS,
  type CompletionLog,
  type DailyStatus,
  type ImpulseLog,
  type JournalEntry,
  type Task,
  type TaskType,
  type UserProfile,
  type Vice,
} from '../types/foco';
import type { StorageLike } from '../audio/ambientAudioEngine';
import {
  evaluateDailyStatus,
  generateId,
  getLocalTimeStr,
  getLocalTodayKey,
  sanitizeTask,
  shiftDateKey,
} from './date';
import {
  XP_PENALTY_ON_FAIL,
  XP_PER_COMPLETION,
  type DayCloseXpReport,
  applyXpDelta,
  evaluateDayCloseXp,
  getLevelProgress,
  hasJournalContent,
  roundXp,
  sanitizeTotalXp,
} from './xp';

function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function readJsonStorage<T>(
  key: string,
  fallback: T,
  storage: StorageLike | null = getBrowserStorage()
): T {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonStorage(
  key: string,
  value: unknown,
  storage: StorageLike | null = getBrowserStorage()
): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export function sanitizeProfile(raw: unknown): UserProfile {
  if (!raw || typeof raw !== 'object') {
    return { name: '', photoDataUrl: null, updatedAt: 0 };
  }
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 60) : '';
  const rawPhoto = typeof obj.photoDataUrl === 'string' ? obj.photoDataUrl.trim() : '';
  const photoDataUrl = rawPhoto.startsWith('data:image/') ? rawPhoto : null;
  const updatedAt =
    typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt) ? obj.updatedAt : 0;

  return { name, photoDataUrl, updatedAt };
}

export function getProfileInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return '';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function sanitizeImpulseLogs(raw: unknown): ImpulseLog[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): ImpulseLog | null => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const thought = typeof obj.thought === 'string' ? obj.thought.trim() : '';
      if (!thought) return null;
      const id = typeof obj.id === 'string' && obj.id ? obj.id : generateId();
      const dateKey =
        typeof obj.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.dateKey)
          ? obj.dateKey
          : getLocalTodayKey();
      const timeStr =
        typeof obj.timeStr === 'string' && obj.timeStr.trim()
          ? obj.timeStr.trim()
          : getLocalTimeStr();
      const actionTaken =
        typeof obj.actionTaken === 'string' ? obj.actionTaken.trim() : '';
      const breathingCycles =
        typeof obj.breathingCycles === 'number' && Number.isFinite(obj.breathingCycles)
          ? Math.max(0, Math.floor(obj.breathingCycles))
          : 0;
      const completedExercise = Boolean(obj.completedExercise);
      const timestamp =
        typeof obj.timestamp === 'number' && Number.isFinite(obj.timestamp)
          ? obj.timestamp
          : Date.now();
      return {
        id,
        thought,
        actionTaken,
        breathingCycles,
        completedExercise,
        dateKey,
        timeStr,
        timestamp,
      };
    })
    .filter((entry): entry is ImpulseLog => entry !== null);
}

export function recordImpulseEntry(params: {
  logs: ImpulseLog[];
  thought: string;
  actionTaken?: string;
  dateKey: string;
  timeStr: string;
  timestamp?: number;
}): {
  logs: ImpulseLog[];
  createdLog: ImpulseLog | null;
} {
  const cleanThought = params.thought.trim();
  if (!cleanThought) {
    return { logs: params.logs, createdLog: null };
  }
  const createdLog: ImpulseLog = {
    id: generateId(),
    thought: cleanThought,
    actionTaken: (params.actionTaken || '').trim(),
    breathingCycles: 0,
    completedExercise: false,
    dateKey: params.dateKey,
    timeStr: params.timeStr,
    timestamp: params.timestamp ?? Date.now(),
  };
  return {
    logs: [createdLog, ...params.logs],
    createdLog,
  };
}

export function completeImpulseExercise(params: {
  logs: ImpulseLog[];
  logId: string;
  actionTaken: string;
  breathingCycles: number;
  completedExercise: boolean;
}): ImpulseLog[] {
  const cleanAction = params.actionTaken.trim();
  const safeCycles = Number.isFinite(params.breathingCycles)
    ? Math.max(0, Math.floor(params.breathingCycles))
    : 0;
  return params.logs.map((log) =>
    log.id === params.logId
      ? {
          ...log,
          actionTaken: cleanAction || log.actionTaken,
          breathingCycles: safeCycles,
          completedExercise: Boolean(params.completedExercise),
        }
      : log
  );
}

export function deleteImpulseEntry(params: {
  logs: ImpulseLog[];
  logId: string;
}): ImpulseLog[] {
  return params.logs.filter((log) => log.id !== params.logId);
}

export function createDefaultVices(todayKey: string = getLocalTodayKey()): Vice[] {
  return [
    {
      id: generateId(),
      name: 'Ver vídeo curto por mais de 10 minutos seguidos',
      streakStartKey: shiftDateKey(todayKey, -14),
      bestStreak: 14,
      relapses: [],
    },
    {
      id: generateId(),
      name: 'Focar no lado ruim das coisas',
      streakStartKey: shiftDateKey(todayKey, -7),
      bestStreak: 21,
      relapses: [],
    },
  ];
}

export function syncHistoryForDate(
  tasks: Task[],
  historyByDate: Record<string, DailyStatus>,
  dateKey: string
): Record<string, DailyStatus> {
  const dailyTasks = tasks.filter((t) => t.type === 'daily');
  const status = evaluateDailyStatus(dailyTasks);
  const next = { ...historyByDate };
  if (status) {
    next[dateKey] = status;
  } else {
    delete next[dateKey];
  }
  return next;
}

export function applyRolloverIfNeeded(
  tasks: Task[],
  historyByDate: Record<string, DailyStatus>,
  lastActiveKey: string | null,
  todayKey: string,
  xpContext?: {
    journalEntries?: Record<string, JournalEntry>;
    vices?: Vice[];
    totalXp?: number;
    xpByDate?: Record<string, number>;
  }
): {
  tasks: Task[];
  historyByDate: Record<string, DailyStatus>;
  didRollover: boolean;
  totalXp: number;
  xpByDate: Record<string, number>;
  dayCloseReport: DayCloseXpReport | null;
} {
  const baseXp = sanitizeTotalXp(xpContext?.totalXp ?? 0);
  const baseXpByDate = xpContext?.xpByDate ?? {};

  if (!lastActiveKey || lastActiveKey === todayKey) {
    return {
      tasks,
      historyByDate: syncHistoryForDate(tasks, historyByDate, todayKey),
      didRollover: false,
      totalXp: baseXp,
      xpByDate: baseXpByDate,
      dayCloseReport: null,
    };
  }

  const dailyTasks = tasks.filter((t) => t.type === 'daily');
  const nextHistory = { ...historyByDate };
  if (dailyTasks.length > 0 && !nextHistory[lastActiveKey]) {
    const status = evaluateDailyStatus(dailyTasks);
    if (status) {
      nextHistory[lastActiveKey] = status;
    }
  }

  let nextTotalXp = baseXp;
  let nextXpByDate = baseXpByDate;
  let dayCloseReport: DayCloseXpReport | null = null;

  if (xpContext) {
    dayCloseReport = evaluateDayCloseXp({
      tasks,
      journalEntries: xpContext.journalEntries ?? {},
      vices: xpContext.vices ?? [],
      closingDateKey: lastActiveKey,
    });
    const xpRes = applyXpDelta({
      totalXp: baseXp,
      xpByDate: baseXpByDate,
      dateKey: lastActiveKey,
      delta: dayCloseReport.netRawDelta,
    });
    nextTotalXp = xpRes.totalXp;
    nextXpByDate = xpRes.xpByDate;
  }

  const resetTasks = tasks.map((task) =>
    task.type === 'daily'
      ? {
          ...task,
          completed: false,
          completedDate: null,
          completedTime: null,
        }
      : task
  );

  return {
    tasks: resetTasks,
    historyByDate: syncHistoryForDate(resetTasks, nextHistory, todayKey),
    didRollover: true,
    totalXp: nextTotalXp,
    xpByDate: nextXpByDate,
    dayCloseReport,
  };
}

export function toggleTaskWithXp(params: {
  tasks: Task[];
  completionLogs: CompletionLog[];
  historyByDate: Record<string, DailyStatus>;
  totalXp: number;
  xpByDate?: Record<string, number>;
  taskId: string;
  todayKey: string;
  timeNow: string;
  fromTimer?: boolean;
}): {
  tasks: Task[];
  completionLogs: CompletionLog[];
  historyByDate: Record<string, DailyStatus>;
  totalXp: number;
  xpByDate: Record<string, number>;
  toggledTask: Task | null;
  didComplete: boolean;
  xpDelta: number;
  leveledUpTo: number | null;
  leveledDownTo: number | null;
} {
  const {
    tasks,
    completionLogs,
    historyByDate,
    totalXp,
    xpByDate = {},
    taskId,
    todayKey,
    timeNow,
    fromTimer = false,
  } = params;
  const prevTask = tasks.find((t) => t.id === taskId);
  if (!prevTask) {
    return {
      tasks,
      completionLogs,
      historyByDate,
      totalXp: sanitizeTotalXp(totalXp),
      xpByDate,
      toggledTask: null,
      didComplete: false,
      xpDelta: 0,
      leveledUpTo: null,
      leveledDownTo: null,
    };
  }

  // Timed tasks only earn XP when their countdown finishes (fromTimer === true)
  if (!prevTask.completed && prevTask.timerMinutes && prevTask.timerMinutes > 0 && !fromTimer) {
    return {
      tasks,
      completionLogs,
      historyByDate,
      totalXp: sanitizeTotalXp(totalXp),
      xpByDate,
      toggledTask: prevTask,
      didComplete: false,
      xpDelta: 0,
      leveledUpTo: null,
      leveledDownTo: null,
    };
  }

  const nextCompleted = !prevTask.completed;
  const prevLevel = getLevelProgress(totalXp).currentLevel.level;

  const nextTasks = tasks.map((t) => {
    if (t.id !== taskId) return t;
    if (nextCompleted) {
      return {
        ...t,
        completed: true,
        completedDate: todayKey,
        completedTime: timeNow,
        completions: t.completions + 1,
      };
    }
    return {
      ...t,
      completed: false,
      completedDate: null,
      completedTime: null,
      completions: Math.max(0, t.completions - 1),
    };
  });

  let nextLogs = [...completionLogs];
  let xpDateTarget = todayKey;
  let rawDelta = 0;

  if (nextCompleted) {
    nextLogs = [
      {
        id: generateId(),
        taskId: prevTask.id,
        title: prevTask.title,
        type: prevTask.type,
        dateKey: todayKey,
        timeStr: timeNow,
        timestamp: Date.now(),
      },
      ...nextLogs,
    ];
    rawDelta = XP_PER_COMPLETION;
  } else {
    const logDateKey = prevTask.completedDate || todayKey;
    xpDateTarget = logDateKey;
    let removeIdx = prevTask.completedTime
      ? nextLogs.findIndex(
          (l) =>
            l.taskId === prevTask.id &&
            l.dateKey === logDateKey &&
            l.timeStr === prevTask.completedTime
        )
      : -1;
    if (removeIdx === -1) {
      removeIdx = nextLogs.findIndex((l) => l.taskId === prevTask.id && l.dateKey === logDateKey);
    }
    if (removeIdx === -1 && logDateKey !== todayKey) {
      removeIdx = nextLogs.findIndex((l) => l.taskId === prevTask.id && l.dateKey === todayKey);
    }
    if (removeIdx !== -1) {
      nextLogs.splice(removeIdx, 1);
    }
    rawDelta = -XP_PER_COMPLETION;
  }

  const xpResult = applyXpDelta({
    totalXp,
    xpByDate,
    dateKey: xpDateTarget,
    delta: rawDelta,
  });

  const nextLevel = getLevelProgress(xpResult.totalXp).currentLevel.level;
  const leveledUpTo = nextLevel > prevLevel ? nextLevel : null;
  const leveledDownTo = nextLevel < prevLevel ? nextLevel : null;
  const nextHistory = syncHistoryForDate(nextTasks, historyByDate, todayKey);
  const toggledTask = nextTasks.find((t) => t.id === taskId) || null;

  return {
    tasks: nextTasks,
    completionLogs: nextLogs,
    historyByDate: nextHistory,
    totalXp: xpResult.totalXp,
    xpByDate: xpResult.xpByDate,
    toggledTask,
    didComplete: nextCompleted,
    xpDelta: xpResult.actualDelta,
    leveledUpTo,
    leveledDownTo,
  };
}

export function deleteTaskWithXp(params: {
  tasks: Task[];
  completionLogs: CompletionLog[];
  historyByDate: Record<string, DailyStatus>;
  totalXp: number;
  xpByDate?: Record<string, number>;
  taskId: string;
  todayKey: string;
}): {
  tasks: Task[];
  completionLogs: CompletionLog[];
  historyByDate: Record<string, DailyStatus>;
  totalXp: number;
  xpByDate: Record<string, number>;
  deletedTask: Task | null;
  xpDelta: number;
  leveledDownTo: number | null;
} {
  const {
    tasks,
    completionLogs,
    historyByDate,
    totalXp,
    xpByDate = {},
    taskId,
    todayKey,
  } = params;

  const targetTask = tasks.find((t) => t.id === taskId) || null;
  if (!targetTask) {
    return {
      tasks,
      completionLogs,
      historyByDate,
      totalXp: sanitizeTotalXp(totalXp),
      xpByDate,
      deletedTask: null,
      xpDelta: 0,
      leveledDownTo: null,
    };
  }

  const nextTasks = tasks.filter((t) => t.id !== taskId);
  const nextHistory = syncHistoryForDate(nextTasks, historyByDate, todayKey);
  const nextLogs = [...completionLogs];

  const wasCompletedInCurrentCycle =
    targetTask.completed && (targetTask.type === 'daily' || targetTask.completedDate === todayKey);

  if (!wasCompletedInCurrentCycle) {
    return {
      tasks: nextTasks,
      completionLogs: nextLogs,
      historyByDate: nextHistory,
      totalXp: sanitizeTotalXp(totalXp),
      xpByDate,
      deletedTask: targetTask,
      xpDelta: 0,
      leveledDownTo: null,
    };
  }

  const prevLevel = getLevelProgress(totalXp).currentLevel.level;
  const logDateKey = targetTask.completedDate || todayKey;
  let removeIdx = targetTask.completedTime
    ? nextLogs.findIndex(
        (l) =>
          l.taskId === targetTask.id &&
          l.dateKey === logDateKey &&
          l.timeStr === targetTask.completedTime
      )
    : -1;
  if (removeIdx === -1) {
    removeIdx = nextLogs.findIndex((l) => l.taskId === targetTask.id && l.dateKey === logDateKey);
  }
  if (removeIdx === -1 && logDateKey !== todayKey) {
    removeIdx = nextLogs.findIndex((l) => l.taskId === targetTask.id && l.dateKey === todayKey);
  }
  if (removeIdx !== -1) {
    nextLogs.splice(removeIdx, 1);
  }

  const xpResult = applyXpDelta({
    totalXp,
    xpByDate,
    dateKey: logDateKey,
    delta: -XP_PER_COMPLETION,
  });
  const nextLevel = getLevelProgress(xpResult.totalXp).currentLevel.level;

  return {
    tasks: nextTasks,
    completionLogs: nextLogs,
    historyByDate: nextHistory,
    totalXp: xpResult.totalXp,
    xpByDate: xpResult.xpByDate,
    deletedTask: targetTask,
    xpDelta: xpResult.actualDelta,
    leveledDownTo: nextLevel < prevLevel ? nextLevel : null,
  };
}

export function saveJournalWithXp(params: {
  journalEntries: Record<string, JournalEntry>;
  totalXp: number;
  xpByDate: Record<string, number>;
  dateKey: string;
  entry: JournalEntry;
}): {
  journalEntries: Record<string, JournalEntry>;
  totalXp: number;
  xpByDate: Record<string, number>;
  xpDelta: number;
  leveledUpTo: number | null;
  leveledDownTo: number | null;
} {
  const { journalEntries, totalXp, xpByDate, dateKey, entry } = params;
  const hadContentBefore = hasJournalContent(journalEntries[dateKey]);
  const hasContentAfter = hasJournalContent(entry);

  let rawDelta = 0;
  if (!hadContentBefore && hasContentAfter) {
    rawDelta = XP_PER_COMPLETION;
  } else if (hadContentBefore && !hasContentAfter) {
    rawDelta = -XP_PER_COMPLETION;
  }

  const prevLevel = getLevelProgress(totalXp).currentLevel.level;
  const xpRes = applyXpDelta({
    totalXp,
    xpByDate,
    dateKey,
    delta: rawDelta,
  });
  const nextLevel = getLevelProgress(xpRes.totalXp).currentLevel.level;

  return {
    journalEntries: { ...journalEntries, [dateKey]: entry },
    totalXp: xpRes.totalXp,
    xpByDate: xpRes.xpByDate,
    xpDelta: xpRes.actualDelta,
    leveledUpTo: nextLevel > prevLevel ? nextLevel : null,
    leveledDownTo: nextLevel < prevLevel ? nextLevel : null,
  };
}

export function clearJournalWithXp(params: {
  journalEntries: Record<string, JournalEntry>;
  totalXp: number;
  xpByDate: Record<string, number>;
  dateKey: string;
}): {
  journalEntries: Record<string, JournalEntry>;
  totalXp: number;
  xpByDate: Record<string, number>;
  xpDelta: number;
  leveledDownTo: number | null;
} {
  const { journalEntries, totalXp, xpByDate, dateKey } = params;
  const hadContentBefore = hasJournalContent(journalEntries[dateKey]);
  const nextEntries = { ...journalEntries };
  delete nextEntries[dateKey];

  const prevLevel = getLevelProgress(totalXp).currentLevel.level;
  const xpRes = applyXpDelta({
    totalXp,
    xpByDate,
    dateKey,
    delta: hadContentBefore ? -XP_PER_COMPLETION : 0,
  });
  const nextLevel = getLevelProgress(xpRes.totalXp).currentLevel.level;

  return {
    journalEntries: nextEntries,
    totalXp: xpRes.totalXp,
    xpByDate: xpRes.xpByDate,
    xpDelta: xpRes.actualDelta,
    leveledDownTo: nextLevel < prevLevel ? nextLevel : null,
  };
}

export function recordRelapseWithXp(params: {
  vices: Vice[];
  totalXp: number;
  xpByDate: Record<string, number>;
  viceId: string;
  trigger: string;
  comment?: string;
  todayKey: string;
  timeNow: string;
  getBestDays: (vice: Vice, todayKey: string) => number;
}): {
  vices: Vice[];
  totalXp: number;
  xpByDate: Record<string, number>;
  xpDelta: number;
  logId: string;
  leveledDownTo: number | null;
} {
  const { vices, totalXp, xpByDate, viceId, trigger, comment = '', todayKey, timeNow, getBestDays } =
    params;
  const logId = generateId();
  const cleanComment = comment.trim();
  const exists = vices.some((v) => v.id === viceId);
  if (!exists) {
    return {
      vices,
      totalXp: sanitizeTotalXp(totalXp),
      xpByDate,
      xpDelta: 0,
      logId,
      leveledDownTo: null,
    };
  }

  const nextVices = vices.map((v) => {
    if (v.id !== viceId) return v;
    const prevBest = getBestDays(v, todayKey);
    return {
      ...v,
      streakStartKey: todayKey,
      bestStreak: prevBest,
      relapses: [
        {
          id: logId,
          dateKey: todayKey,
          timeStr: timeNow,
          trigger,
          context: cleanComment,
          plan: '',
        },
        ...v.relapses,
      ],
    };
  });

  const prevLevel = getLevelProgress(totalXp).currentLevel.level;
  const xpRes = applyXpDelta({
    totalXp,
    xpByDate,
    dateKey: todayKey,
    delta: -XP_PENALTY_ON_FAIL,
  });
  const nextLevel = getLevelProgress(xpRes.totalXp).currentLevel.level;

  return {
    vices: nextVices,
    totalXp: xpRes.totalXp,
    xpByDate: xpRes.xpByDate,
    xpDelta: xpRes.actualDelta,
    logId,
    leveledDownTo: nextLevel < prevLevel ? nextLevel : null,
  };
}

export function addTaskState(params: {
  tasks: Task[];
  historyByDate: Record<string, DailyStatus>;
  title: string;
  type: TaskType;
  todayKey: string;
  timerMinutes?: number | null;
}): {
  tasks: Task[];
  historyByDate: Record<string, DailyStatus>;
  addedTask: Task | null;
} {
  const cleanTitle = params.title.trim();
  if (!cleanTitle) {
    return {
      tasks: params.tasks,
      historyByDate: params.historyByDate,
      addedTask: null,
    };
  }

  const rawTimer = Number(params.timerMinutes);
  const timerMinutes =
    Number.isFinite(rawTimer) && rawTimer >= 1 ? Math.min(180, Math.floor(rawTimer)) : null;

  const newTask: Task = {
    id: generateId(),
    title: cleanTitle,
    type: params.type,
    completed: false,
    completedDate: null,
    completedTime: null,
    completions: 0,
    createdAt: Date.now(),
    timerMinutes,
  };

  const nextTasks = [newTask, ...params.tasks];
  const nextHistory = syncHistoryForDate(nextTasks, params.historyByDate, params.todayKey);

  return {
    tasks: nextTasks,
    historyByDate: nextHistory,
    addedTask: newTask,
  };
}

export function simulateNextDayState(params: {
  tasks: Task[];
  historyByDate: Record<string, DailyStatus>;
  completionLogs: CompletionLog[];
  impulseLogs?: ImpulseLog[];
  journalEntries?: Record<string, JournalEntry>;
  vices: Vice[];
  totalXp?: number;
  xpByDate?: Record<string, number>;
  todayKey: string;
}): {
  tasks: Task[];
  historyByDate: Record<string, DailyStatus>;
  completionLogs: CompletionLog[];
  impulseLogs: ImpulseLog[];
  journalEntries: Record<string, JournalEntry>;
  vices: Vice[];
  totalXp: number;
  xpByDate: Record<string, number>;
  dayCloseReport: DayCloseXpReport;
  xpDeltaApplied: number;
} {
  const {
    tasks,
    historyByDate,
    completionLogs,
    impulseLogs = [],
    journalEntries = {},
    vices,
    totalXp = 0,
    xpByDate = {},
    todayKey,
  } = params;

  const dailyTasks = tasks.filter((t) => t.type === 'daily');
  const todayStatus = evaluateDailyStatus(dailyTasks);

  // 1. Evaluate end-of-day XP for todayKey (clean vices +1 XP, missed dailies -0.5 XP, missed journal -0.5 XP)
  const dayCloseReport = evaluateDayCloseXp({
    tasks,
    journalEntries,
    vices,
    closingDateKey: todayKey,
  });
  const xpApplied = applyXpDelta({
    totalXp,
    xpByDate,
    dateKey: todayKey,
    delta: dayCloseReport.netRawDelta,
  });

  // 2. Shift history, logs, xpByDate, journalEntries backward by 1 day
  const shiftedHistory: Record<string, DailyStatus> = {};
  Object.entries(historyByDate).forEach(([key, status]) => {
    if (key <= todayKey) {
      shiftedHistory[shiftDateKey(key, -1)] = status;
    } else {
      shiftedHistory[key] = status;
    }
  });
  if (todayStatus) {
    shiftedHistory[shiftDateKey(todayKey, -1)] = todayStatus;
  }

  const shiftedXpByDate: Record<string, number> = {};
  Object.entries(xpApplied.xpByDate).forEach(([key, val]) => {
    const targetKey = key <= todayKey ? shiftDateKey(key, -1) : key;
    shiftedXpByDate[targetKey] = roundXp((shiftedXpByDate[targetKey] || 0) + val);
  });

  const shiftedJournalEntries: Record<string, JournalEntry> = {};
  Object.entries(journalEntries).forEach(([key, entry]) => {
    const targetKey = key <= todayKey ? shiftDateKey(key, -1) : key;
    shiftedJournalEntries[targetKey] = entry;
  });

  const shiftedLogs = completionLogs.map((log) =>
    log.dateKey <= todayKey ? { ...log, dateKey: shiftDateKey(log.dateKey, -1) } : log
  );

  const shiftedImpulseLogs = impulseLogs.map((log) =>
    log.dateKey <= todayKey ? { ...log, dateKey: shiftDateKey(log.dateKey, -1) } : log
  );

  const resetTasks = tasks.map((task) =>
    task.type === 'daily'
      ? { ...task, completed: false, completedDate: null, completedTime: null }
      : task
  );

  const syncedHistory = syncHistoryForDate(resetTasks, shiftedHistory, todayKey);

  const shiftedVices = vices.map((vice) => ({
    ...vice,
    streakStartKey: shiftDateKey(vice.streakStartKey, -1),
    relapses: vice.relapses.map((r) => ({
      ...r,
      dateKey: r.dateKey <= todayKey ? shiftDateKey(r.dateKey, -1) : r.dateKey,
    })),
  }));

  return {
    tasks: resetTasks,
    historyByDate: syncedHistory,
    completionLogs: shiftedLogs,
    impulseLogs: shiftedImpulseLogs,
    journalEntries: shiftedJournalEntries,
    vices: shiftedVices,
    totalXp: xpApplied.totalXp,
    xpByDate: shiftedXpByDate,
    dayCloseReport,
    xpDeltaApplied: xpApplied.actualDelta,
  };
}

export function loadInitialFocoState(
  storage: StorageLike | null = getBrowserStorage(),
  todayKey: string = getLocalTodayKey()
): {
  tasks: Task[];
  historyByDate: Record<string, DailyStatus>;
  completionLogs: CompletionLog[];
  impulseLogs: ImpulseLog[];
  totalXp: number;
  xpByDate: Record<string, number>;
  journalEntries: Record<string, JournalEntry>;
  vices: Vice[];
  profile: UserProfile;
} {
  const rawTasks = readJsonStorage<unknown[]>(STORAGE_KEYS.TASKS, [], storage);
  const sanitizedTasks = Array.isArray(rawTasks)
    ? rawTasks
        .map((t) => sanitizeTask(t, todayKey, getLocalTimeStr()))
        .filter((t): t is Task => t !== null)
    : [];

  const rawHistory = readJsonStorage<Record<string, DailyStatus>>(STORAGE_KEYS.HISTORY, {}, storage);
  const safeHistory = rawHistory && typeof rawHistory === 'object' ? rawHistory : {};

  const rawLogs = readJsonStorage<CompletionLog[]>(STORAGE_KEYS.COMPLETION_LOGS, [], storage);
  const safeLogs = Array.isArray(rawLogs) ? rawLogs : [];

  const rawImpulseLogs = readJsonStorage<unknown>(STORAGE_KEYS.IMPULSE_LOGS, [], storage);
  const safeImpulseLogs = sanitizeImpulseLogs(rawImpulseLogs);

  const rawJournal = readJsonStorage<Record<string, JournalEntry>>(STORAGE_KEYS.JOURNAL, {}, storage);
  const safeJournal = rawJournal && typeof rawJournal === 'object' ? rawJournal : {};

  const rawProfile = readJsonStorage<unknown>(STORAGE_KEYS.PROFILE, null, storage);
  const safeProfile = sanitizeProfile(rawProfile);

  const rawVices = readJsonStorage<Vice[] | null>(STORAGE_KEYS.VICES, null, storage);
  let safeVices: Vice[];
  if (Array.isArray(rawVices) && rawVices.length > 0) {
    safeVices = rawVices.map((v) => ({
      ...v,
      relapses: Array.isArray(v.relapses) ? v.relapses : [],
    }));
  } else {
    safeVices = createDefaultVices(todayKey);
    writeJsonStorage(STORAGE_KEYS.VICES, safeVices, storage);
  }

  // Hydrate totalXp cleanly before rollover evaluation
  const rawXpStr = storage?.getItem(STORAGE_KEYS.TOTAL_XP);
  let baseTotalXp: number;
  if (rawXpStr !== null && rawXpStr !== undefined && rawXpStr !== '') {
    const parsed = Number(rawXpStr);
    baseTotalXp = Number.isFinite(parsed) ? sanitizeTotalXp(parsed) : 0;
  } else {
    const sumTaskCompletions = sanitizedTasks.reduce((acc, t) => acc + t.completions, 0);
    baseTotalXp = roundXp(Math.max(safeLogs.length, sumTaskCompletions) * XP_PER_COMPLETION);
  }

  // Hydrate or migrate xpByDate cleanly
  const rawXpByDate = readJsonStorage<Record<string, number> | null>(
    STORAGE_KEYS.XP_BY_DATE,
    null,
    storage
  );
  let baseXpByDate: Record<string, number> = {};
  if (rawXpByDate && typeof rawXpByDate === 'object' && !Array.isArray(rawXpByDate)) {
    Object.entries(rawXpByDate).forEach(([k, v]) => {
      const n = Number(v);
      if (Number.isFinite(n) && n !== 0) {
        baseXpByDate[k] = roundXp(n);
      }
    });
  } else {
    safeLogs.forEach((log) => {
      baseXpByDate[log.dateKey] = roundXp((baseXpByDate[log.dateKey] || 0) + XP_PER_COMPLETION);
    });
  }

  // Reconcile any un-preserved completion logs from today whose task was deleted prior to the fix
  let reconciledLogs = safeLogs;
  const existingTaskIds = new Set(sanitizedTasks.map((t) => t.id));
  const orphanTodayLogs = safeLogs.filter(
    (log) => log.dateKey === todayKey && !log.preserved && !existingTaskIds.has(log.taskId)
  );
  if (orphanTodayLogs.length > 0) {
    const orphanIds = new Set(orphanTodayLogs.map((l) => l.id));
    reconciledLogs = safeLogs.filter((l) => !orphanIds.has(l.id));
    const orphanAdjust = applyXpDelta({
      totalXp: baseTotalXp,
      xpByDate: baseXpByDate,
      dateKey: todayKey,
      delta: -orphanTodayLogs.length * XP_PER_COMPLETION,
    });
    baseTotalXp = orphanAdjust.totalXp;
    baseXpByDate = orphanAdjust.xpByDate;
    writeJsonStorage(STORAGE_KEYS.COMPLETION_LOGS, reconciledLogs, storage);
  }

  const lastActive = storage?.getItem(STORAGE_KEYS.LAST_ACTIVE_DAY) ?? null;
  const rolled = applyRolloverIfNeeded(sanitizedTasks, safeHistory, lastActive, todayKey, {
    journalEntries: safeJournal,
    vices: safeVices,
    totalXp: baseTotalXp,
    xpByDate: baseXpByDate,
  });

  try {
    storage?.setItem(STORAGE_KEYS.LAST_ACTIVE_DAY, todayKey);
  } catch {
    // Ignore storage quota errors
  }
  writeJsonStorage(STORAGE_KEYS.TASKS, rolled.tasks, storage);
  writeJsonStorage(STORAGE_KEYS.HISTORY, rolled.historyByDate, storage);
  writeJsonStorage(STORAGE_KEYS.TOTAL_XP, rolled.totalXp, storage);
  writeJsonStorage(STORAGE_KEYS.XP_BY_DATE, rolled.xpByDate, storage);

  return {
    tasks: rolled.tasks,
    historyByDate: rolled.historyByDate,
    completionLogs: reconciledLogs,
    impulseLogs: safeImpulseLogs,
    totalXp: rolled.totalXp,
    xpByDate: rolled.xpByDate,
    journalEntries: safeJournal,
    vices: safeVices,
    profile: safeProfile,
  };
}
