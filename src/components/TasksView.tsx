import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Award,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import type {
  ActiveTaskTimer,
  AnalyticsRange,
  CompletionLog,
  DailyStatus,
  Task,
  TaskType,
} from '../types/foco';
import {
  calculateCleanStreak,
  formatDateKey,
  formatFullPtDate,
  formatShortPtDate,
  formatTimerClock,
  parseDateKey,
  shiftDateKey,
} from '../utils/date';
import {
  XP_PER_COMPLETION,
  formatXp,
  getDailyComboSummary,
  getLevelProgress,
  getSkillTierInfo,
  getTodayXpEarned,
} from '../utils/xp';

interface TasksViewProps {
  tasks: Task[];
  historyByDate: Record<string, DailyStatus>;
  completionLogs: CompletionLog[];
  totalXp: number;
  xpByDate: Record<string, number>;
  todayKey: string;
  activeTimer: ActiveTaskTimer | null;
  onAddTask: (title: string, type: TaskType, timerMinutes?: number | null) => void;
  onToggleTask: (taskId: string) => void;
  onUpdateTaskTitle: (taskId: string, nextTitle: string) => void;
  onDeleteTask: (taskId: string) => void;
  onClearCompleted: () => void;
  onOpenLevels: () => void;
  onStartTimer: (taskId: string) => void;
  onTogglePauseTimer: () => void;
  onResetTimer: () => void;
  onCancelTimer: () => void;
}

interface TooltipState {
  dayKey: string;
  logs: CompletionLog[];
  x: number;
  y: number;
}

function getIntensityClass(count: number): string {
  if (count <= 0) return 'bg-slate-900 border-slate-800/90 text-slate-600';
  if (count === 1) return 'bg-indigo-950 border-indigo-800/70 text-indigo-300';
  if (count === 2) return 'bg-indigo-800 border-indigo-600/80 text-indigo-100';
  if (count <= 4) return 'bg-indigo-600 border-indigo-400/80 text-white';
  return 'bg-blue-400 border-blue-300 text-slate-950 font-bold';
}

export function TasksView({
  tasks,
  historyByDate,
  completionLogs,
  totalXp,
  xpByDate,
  todayKey,
  activeTimer,
  onAddTask,
  onToggleTask,
  onUpdateTaskTitle,
  onDeleteTask,
  onClearCompleted,
  onOpenLevels,
  onStartTimer,
  onTogglePauseTimer,
  onResetTimer,
  onCancelTimer,
}: TasksViewProps) {
  const [titleInput, setTitleInput] = useState('');
  const [selectedTaskType, setSelectedTaskType] = useState<TaskType>('daily');
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerMinutesDraft, setTimerMinutesDraft] = useState('10');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');

  const todayDate = parseDateKey(todayKey);

  const [calendarYear, setCalendarYear] = useState(todayDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(todayDate.getMonth());
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);
  const prevTodayKeyRef = useRef(todayKey);

  const [analyticsFilterTaskId, setAnalyticsFilterTaskId] = useState<string>('all');
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>('month');
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const heatmapContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync selectedDayKey & calendar month if midnight passes while viewing today
  useEffect(() => {
    if (prevTodayKeyRef.current !== todayKey) {
      if (selectedDayKey === prevTodayKeyRef.current) {
        setSelectedDayKey(todayKey);
        const dt = parseDateKey(todayKey);
        setCalendarYear(dt.getFullYear());
        setCalendarMonth(dt.getMonth());
      }
      prevTodayKeyRef.current = todayKey;
    }
  }, [todayKey, selectedDayKey]);

  // If the currently filtered or edited task is deleted, reset cleanly
  useEffect(() => {
    if (analyticsFilterTaskId !== 'all' && !tasks.some((t) => t.id === analyticsFilterTaskId)) {
      setAnalyticsFilterTaskId('all');
    }
    if (editingTaskId && !tasks.some((t) => t.id === editingTaskId)) {
      setEditingTaskId(null);
    }
  }, [tasks, analyticsFilterTaskId, editingTaskId]);

  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      if (heatmapContainerRef.current && !heatmapContainerRef.current.contains(e.target as Node)) {
        setTooltip(null);
      }
    }
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  const dailyTasks = useMemo(() => tasks.filter((t) => t.type === 'daily'), [tasks]);
  const onceTasks = useMemo(() => tasks.filter((t) => t.type === 'once'), [tasks]);
  const pendingTimedTasks = useMemo(
    () => tasks.filter((t) => !t.completed && t.timerMinutes && t.timerMinutes > 0),
    [tasks]
  );
  const activeTimerTask = useMemo(
    () => (activeTimer ? tasks.find((t) => t.id === activeTimer.taskId) || null : null),
    [activeTimer, tasks]
  );
  const doneCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);
  const streak = useMemo(() => calculateCleanStreak(historyByDate, todayKey), [historyByDate, todayKey]);
  const dailyCombo = useMemo(() => getDailyComboSummary(tasks), [tasks]);
  const todayXpStats = useMemo(
    () => getTodayXpEarned(tasks, completionLogs, todayKey, xpByDate),
    [tasks, completionLogs, todayKey, xpByDate]
  );
  const xpSummary = useMemo(() => getLevelProgress(totalXp), [totalXp]);

  const calendarData = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;
    const monthLabel = firstDay.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });

    const days: { day: number; key: string; status: DailyStatus | null }[] = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dt = new Date(calendarYear, calendarMonth, day, 12, 0, 0);
      const key = formatDateKey(dt);
      days.push({
        day,
        key,
        status: historyByDate[key] || null,
      });
    }

    return { monthLabel, startOffset, days };
  }, [calendarYear, calendarMonth, historyByDate]);

  const selectedDayStatus = historyByDate[selectedDayKey] || null;
  const selectedDayLogs = useMemo(
    () => completionLogs.filter((l) => l.dateKey === selectedDayKey),
    [completionLogs, selectedDayKey]
  );

  const analytics = useMemo(() => {
    const filteredLogs =
      analyticsFilterTaskId === 'all'
        ? completionLogs
        : completionLogs.filter((l) => l.taskId === analyticsFilterTaskId);

    const daysCount = analyticsRange === 'week' ? 7 : analyticsRange === 'year' ? 365 : 30;
    const startKey = shiftDateKey(todayKey, -(daysCount - 1));
    const periodLogs = filteredLogs.filter((l) => l.dateKey >= startKey && l.dateKey <= todayKey);

    const countByDay: Record<string, number> = {};
    const logsByDay: Record<string, CompletionLog[]> = {};
    periodLogs.forEach((l) => {
      countByDay[l.dateKey] = (countByDay[l.dateKey] || 0) + 1;
      if (!logsByDay[l.dateKey]) logsByDay[l.dateKey] = [];
      logsByDay[l.dateKey].push(l);
    });

    const dateSeries: string[] = [];
    for (let i = 0; i < daysCount; i += 1) {
      dateSeries.push(shiftDateKey(startKey, i));
    }

    let busiestKey: string | null = null;
    let busiestCount = 0;
    dateSeries.forEach((k) => {
      const c = countByDay[k] || 0;
      if (c > busiestCount) {
        busiestCount = c;
        busiestKey = k;
      }
    });

    let bestStreak = 0;
    let bestStart: string | null = null;
    let bestEnd: string | null = null;
    let runLen = 0;
    let runStart: string | null = null;

    dateSeries.forEach((k) => {
      if ((countByDay[k] || 0) > 0) {
        if (runLen === 0) runStart = k;
        runLen += 1;
        if (runLen > bestStreak) {
          bestStreak = runLen;
          bestStart = runStart;
          bestEnd = k;
        }
      } else {
        runLen = 0;
        runStart = null;
      }
    });

    let currentMarkedStreak = 0;
    let startIdx = dateSeries.length - 1;
    if (
      startIdx >= 1 &&
      (countByDay[dateSeries[startIdx]] || 0) === 0 &&
      (countByDay[dateSeries[startIdx - 1]] || 0) > 0
    ) {
      startIdx -= 1;
    }
    for (let i = startIdx; i >= 0; i -= 1) {
      if ((countByDay[dateSeries[i]] || 0) > 0) {
        currentMarkedStreak += 1;
      } else {
        break;
      }
    }

    const visibleCells = analyticsRange === 'year' ? dateSeries.slice(-56) : dateSeries;
    const visibleLen = visibleCells.length;
    const monthHeaders = Array.from({ length: 7 }, (_, col) => {
      if (col !== 0 && col !== 3 && col !== 6) return '';
      if (visibleLen === 0) return '';
      const idx = Math.min(visibleLen - 1, Math.max(0, Math.floor((col / 6) * (visibleLen - 1))));
      const dt = parseDateKey(visibleCells[idx]);
      return dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    });

    return {
      totalInPeriod: periodLogs.length,
      periodLabelText:
        analyticsRange === 'week'
          ? 'nos últimos 7 dias'
          : analyticsRange === 'year'
          ? 'nos últimos 365 dias'
          : 'nos últimos 30 dias',
      busiestKey,
      busiestCount,
      bestStreak,
      bestStart,
      bestEnd,
      currentMarkedStreak,
      visibleCells,
      monthHeaders,
      countByDay,
      logsByDay,
    };
  }, [completionLogs, analyticsFilterTaskId, analyticsRange, todayKey]);

  const selectedFilterTask = tasks.find((t) => t.id === analyticsFilterTaskId) || null;

  function getClampedTimerMinutes(): number {
    const parsed = Number(timerMinutesDraft);
    if (!Number.isFinite(parsed) || parsed < 1) return 10;
    return Math.min(180, Math.floor(parsed));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = titleInput.trim();
    if (!clean) {
      taskInputRef.current?.focus();
      return;
    }
    const chosenMinutes = timerEnabled ? getClampedTimerMinutes() : null;
    onAddTask(clean, selectedTaskType, chosenMinutes);
    setTitleInput('');
    setTimerEnabled(false);
    taskInputRef.current?.focus();
  }

  function startEditing(task: Task) {
    setEditingTaskId(task.id);
    setEditingDraft(task.title);
  }

  function commitEditing(taskId: string) {
    setEditingTaskId(null);
    const clean = editingDraft.trim();
    if (clean) {
      onUpdateTaskTitle(taskId, clean);
    }
  }

  function openTooltip(e: React.MouseEvent, dayKey: string, logs: CompletionLog[]) {
    const x = Math.max(12, Math.min(window.innerWidth - 270, e.clientX + 12));
    const y = Math.max(12, Math.min(window.innerHeight - 120, e.clientY - 76));
    setTooltip({ dayKey, logs, x, y });
  }

  function renderTaskRow(task: Task) {
    const isEditing = editingTaskId === task.id;
    const skillTier = getSkillTierInfo(task.completions);
    const hasTimer = Boolean(task.timerMinutes && task.timerMinutes > 0);
    const isThisTimerActive = Boolean(activeTimer && activeTimer.taskId === task.id);
    const isTimedAndPending = hasTimer && !task.completed;

    return (
      <motion.li
        layout
        key={task.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -16, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        className={`group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border transition-colors ${
          isThisTimerActive
            ? 'bg-indigo-50/90 dark:bg-indigo-950/35 border-indigo-400/70 dark:border-indigo-500/60'
            : 'bg-slate-50/90 dark:bg-slate-950/65 hover:bg-slate-100/90 dark:hover:bg-slate-900 border-slate-200/70 dark:border-slate-800/80'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <input
            type="checkbox"
            checked={task.completed}
            disabled={isTimedAndPending}
            onChange={() => onToggleTask(task.id)}
            title={
              isTimedAndPending
                ? `Conclui automaticamente ao zerar o cronômetro de ${task.timerMinutes} min`
                : `Marcar "${task.title}" como concluída`
            }
            aria-label={
              isTimedAndPending
                ? `"${task.title}" requer cronômetro de ${task.timerMinutes} min`
                : `Marcar "${task.title}" como concluída`
            }
            className={`task-checkbox ${isTimedAndPending ? 'opacity-45 cursor-not-allowed' : ''}`}
          />

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                type="text"
                autoFocus
                value={editingDraft}
                onChange={(e) => setEditingDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitEditing(task.id);
                  } else if (e.key === 'Escape') {
                    setEditingTaskId(null);
                  }
                }}
                onBlur={() => commitEditing(task.id)}
                className="w-full px-2 py-1 rounded-md text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-indigo-500 focus:outline-none"
              />
            ) : (
              <>
                <p
                  onDoubleClick={() => startEditing(task)}
                  title="Duplo clique para editar"
                  className={
                    task.completed
                      ? 'text-sm font-medium line-through text-slate-400 dark:text-slate-500 truncate cursor-text'
                      : 'text-sm font-medium text-slate-800 dark:text-slate-100 truncate cursor-text'
                  }
                >
                  {task.title}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] tabular-nums">
                  {task.completed && task.completedTime ? (
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      Concluída às {task.completedTime}
                    </span>
                  ) : hasTimer ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400">
                      <Clock className="w-3 h-3" />
                      {isThisTimerActive && activeTimer
                        ? `${formatTimerClock(activeTimer.remainingSeconds)} restantes`
                        : `${task.timerMinutes} min (XP só ao zerar)`}
                    </span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">
                      {task.type === 'daily' ? 'Pendente hoje' : 'Pendente'}
                    </span>
                  )}
                  {task.completions > 0 && (
                    <>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold font-mono">
                        {skillTier.xp} XP ({skillTier.tierName})
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isEditing && isTimedAndPending && (
            <button
              type="button"
              onClick={() =>
                isThisTimerActive ? onTogglePauseTimer() : onStartTimer(task.id)
              }
              aria-label={
                isThisTimerActive && activeTimer?.isRunning
                  ? `Pausar cronômetro de ${task.title}`
                  : `Iniciar cronômetro de ${task.title}`
              }
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
            >
              {isThisTimerActive && activeTimer?.isRunning ? (
                <>
                  <Pause className="w-3 h-3" />
                  <span>Pausar</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  <span>{isThisTimerActive ? 'Retomar' : 'Iniciar'}</span>
                </>
              )}
            </button>
          )}
          {!isEditing && (
            <span className="text-[11px] font-mono font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
              +{XP_PER_COMPLETION} XP
            </span>
          )}
          <button
            type="button"
            onClick={() => onDeleteTask(task.id)}
            aria-label={`Excluir tarefa "${task.title}"`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 opacity-70 sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.li>
    );
  }

  return (
    <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Combo Diário + Tasks + XP ganho hoje */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="xl:col-span-4 space-y-5 bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5"
        >
          {/* Combo Diário Bar */}
          <div className="rounded-xl bg-slate-50/90 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800/80 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Trophy
                  className={`w-3.5 h-3.5 ${
                    dailyCombo.isAllDailyDone
                      ? 'text-emerald-500'
                      : 'text-indigo-600 dark:text-indigo-400'
                  }`}
                />
                <span>Combo Diário</span>
              </span>
              <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                {dailyCombo.completedDaily}/{dailyCombo.totalDaily}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <motion.div
                initial={false}
                animate={{ width: `${dailyCombo.percent}%` }}
                transition={{ type: 'spring', stiffness: 180, damping: 24 }}
                className={`h-full rounded-full transition-colors ${
                  dailyCombo.isAllDailyDone
                    ? 'bg-emerald-500'
                    : 'bg-indigo-600 dark:bg-indigo-500'
                }`}
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {dailyCombo.totalDaily === 0
                ? 'Crie uma habilidade diária para acompanhar seu combo.'
                : dailyCombo.isAllDailyDone
                ? 'Todas as habilidades diárias de hoje foram concluídas.'
                : `Conclua suas diárias para completar o combo (${dailyCombo.percent}%).`}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative flex items-center">
              <input
                ref={taskInputRef}
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Adicionar nova tarefa..."
                autoComplete="off"
                className="w-full pl-4 pr-28 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all text-sm sm:text-base"
              />
              <div className="absolute right-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTimerEnabled((prev) => !prev)}
                  aria-pressed={timerEnabled}
                  aria-label="Ativar opção Time (cronômetro)"
                  title="Opção Time: definir tempo no cronômetro (só ganha XP ao acabar)"
                  className={`inline-flex items-center gap-1 px-2 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    timerEnabled
                      ? 'bg-indigo-600/15 dark:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border-indigo-500/50'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-indigo-600 dark:hover:text-indigo-300'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {timerEnabled ? `${getClampedTimerMinutes()}m` : 'Time'}
                  </span>
                </button>

                <button
                  type="submit"
                  aria-label="Adicionar tarefa"
                  className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {timerEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -4 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -4 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/35 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Tempo marcado (Time)</span>
                  </span>
                  <span className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
                    XP só entra quando zerar
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {[5, 10, 15, 25, 45].map((mins) => {
                    const active = getClampedTimerMinutes() === mins;
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setTimerMinutesDraft(String(mins))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums border transition-colors cursor-pointer ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                        }`}
                      >
                        {mins} min
                      </button>
                    );
                  })}

                  <div className="inline-flex items-center gap-1 ml-auto">
                    <input
                      type="number"
                      min={1}
                      max={180}
                      aria-label="Minutos do cronômetro"
                      value={timerMinutesDraft}
                      onChange={(e) => setTimerMinutesDraft(e.target.value)}
                      className="w-16 px-2 py-1 rounded-lg text-xs font-mono font-bold text-center tabular-nums bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">min</span>
                  </div>
                </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setSelectedTaskType('daily')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
                    selectedTaskType === 'daily'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Diária (24h)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTaskType('once')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
                    selectedTaskType === 'once'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Única
                </button>
              </div>

              <span className="text-slate-400 dark:text-slate-500 text-[11px] sm:text-xs">
                {selectedTaskType === 'daily' ? 'Reseta todo dia às 00:00' : 'Conclui uma única vez'}
              </span>
            </div>
          </form>

          {/* Cronômetro de Foco right below Adicionar nova tarefa */}
          <div className="rounded-xl bg-slate-50/90 dark:bg-slate-950/75 border border-slate-200/80 dark:border-slate-800/80 p-3.5 space-y-2.5">
            {activeTimer && activeTimerTask ? (
              (() => {
                const elapsed = Math.max(0, activeTimer.totalSeconds - activeTimer.remainingSeconds);
                const percent =
                  activeTimer.totalSeconds > 0
                    ? Math.min(100, Math.round((elapsed / activeTimer.totalSeconds) * 100))
                    : 0;
                return (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {activeTimer.isRunning ? 'Cronômetro ativo' : 'Cronômetro pausado'}
                          </span>
                        </span>
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate mt-0.5">
                          {activeTimerTask.title}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-2xl font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                          {formatTimerClock(activeTimer.remainingSeconds)}
                        </span>
                      </div>
                    </div>

                    <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <motion.div
                        initial={false}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                        className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        +1 XP liberado somente ao zerar
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={onTogglePauseTimer}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                        >
                          {activeTimer.isRunning ? (
                            <>
                              <Pause className="w-3.5 h-3.5" />
                              <span>Pausar</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              <span>Continuar</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={onResetTimer}
                          aria-label="Reiniciar cronômetro"
                          title="Reiniciar tempo"
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={onCancelTimer}
                          aria-label="Fechar cronômetro"
                          title="Parar cronômetro"
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-rose-500/10 text-slate-500 hover:text-rose-500 border border-slate-200 dark:border-slate-700 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Cronômetro de Foco</span>
                  </span>
                  <span className="text-sm font-mono font-bold tabular-nums text-slate-400 dark:text-slate-500">
                    {timerEnabled ? `${String(getClampedTimerMinutes()).padStart(2, '0')}:00` : '00:00'}
                  </span>
                </div>

                {pendingTimedTasks.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Clique para iniciar a contagem e ganhar +1 XP ao zerar:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {pendingTimedTasks.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onStartTimer(t.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 hover:border-indigo-400 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
                        >
                          <Play className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                          <span className="max-w-[150px] truncate">{t.title}</span>
                          <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                            {t.timerMinutes}m
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Ative o relógio <strong className="text-slate-700 dark:text-slate-200">Time</strong> acima para marcar minutos. Só ganha XP ao zerar.
                    </p>
                    {!timerEnabled && (
                      <button
                        type="button"
                        onClick={() => {
                          setTimerEnabled(true);
                          setTimerMinutesDraft('10');
                          taskInputRef.current?.focus();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 cursor-pointer shrink-0"
                      >
                        <Clock className="w-3 h-3" />
                        <span>Usar Time (10 min)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-1 text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200/70 dark:border-slate-800/80 pb-3">
            <span className="tabular-nums">
              {tasks.length === 0
                ? 'Nenhuma tarefa cadastrada'
                : `${doneCount} de ${tasks.length} concluídas hoje`}
            </span>
            {doneCount > 0 && (
              <button
                type="button"
                onClick={onClearCompleted}
                className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors cursor-pointer"
              >
                Limpar concluídas
              </button>
            )}
          </div>

          <div className="space-y-6">
            {dailyTasks.length > 0 && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
                    <span>Diárias</span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      · {dailyTasks.length}
                    </span>
                  </h2>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">Ciclo de 24h</span>
                </div>
                <ul className="space-y-2">
                  <AnimatePresence initial={false}>
                    {dailyTasks.map(renderTaskRow)}
                  </AnimatePresence>
                </ul>
              </section>
            )}

            {onceTasks.length > 0 && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
                    <span>Únicas</span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      · {onceTasks.length}
                    </span>
                  </h2>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">Sem repetição</span>
                </div>
                <ul className="space-y-2">
                  <AnimatePresence initial={false}>
                    {onceTasks.map(renderTaskRow)}
                  </AnimatePresence>
                </ul>
              </section>
            )}

            {tasks.length === 0 && (
              <div className="py-10 text-center space-y-1.5">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Nenhuma tarefa por aqui
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Digite acima para criar uma habilidade diária ou única (+1 XP).
                </p>
              </div>
            )}
          </div>

          {/* XP Ganho Hoje + Quick Level Progress */}
          <div className="rounded-xl bg-slate-50/90 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800/80 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    XP ganho hoje
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {todayXpStats.completedTodayCount}{' '}
                    {todayXpStats.completedTodayCount === 1
                      ? 'habilidade concluída'
                      : 'habilidades concluídas'}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p
                  className={`text-xl font-extrabold font-mono tabular-nums leading-none ${
                    todayXpStats.xpToday < 0
                      ? 'text-rose-500 dark:text-rose-400'
                      : 'text-indigo-600 dark:text-indigo-400'
                  }`}
                >
                  {todayXpStats.xpToday >= 0
                    ? `+${formatXp(todayXpStats.xpToday)}`
                    : formatXp(todayXpStats.xpToday)}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  no dia todo
                </p>
              </div>
            </div>

            <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 min-w-0">
                  <Award className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">
                    Nível {xpSummary.currentLevel.level} · {xpSummary.currentLevel.title}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onOpenLevels}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Ver 15 níveis
                </button>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <motion.div
                  initial={false}
                  animate={{ width: `${xpSummary.progressPercent}%` }}
                  transition={{ type: 'spring', stiffness: 180, damping: 24 }}
                  className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {xpSummary.isMaxLevel
                  ? `${formatXp(xpSummary.totalXp)} XP total · Nível máximo alcançado`
                  : `${formatXp(xpSummary.totalXp)} XP total · falta ${formatXp(
                      xpSummary.xpRemainingToNext
                    )} XP para o Nível ${xpSummary.nextLevel?.level}`}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Concluir: +1 XP · Falhar diária ao fechar o dia: -0,5 XP
              </p>
            </div>
          </div>
        </motion.section>

        {/* CENTER COLUMN: Monthly Consistency Calendar */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.05, ease: 'easeOut' }}
          className="xl:col-span-4 bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Calendário de Constância
              </h2>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 capitalize mt-0.5">
                {calendarData.monthLabel}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() => {
                  if (calendarMonth === 0) {
                    setCalendarMonth(11);
                    setCalendarYear((y) => y - 1);
                  } else {
                    setCalendarMonth((m) => m - 1);
                  }
                }}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() => {
                  if (calendarMonth === 11) {
                    setCalendarMonth(0);
                    setCalendarYear((y) => y + 1);
                  } else {
                    setCalendarMonth((m) => m + 1);
                  }
                }}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            <span>Seg</span>
            <span>Ter</span>
            <span>Qua</span>
            <span>Qui</span>
            <span>Sex</span>
            <span>Sáb</span>
            <span>Dom</span>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: calendarData.startOffset }).map((_, i) => (
              <div key={`spacer-${i}`} className="h-9" />
            ))}
            {calendarData.days.map(({ day, key, status }) => {
              const isSelected = key === selectedDayKey;
              const isToday = key === todayKey;

              let colorClasses =
                'bg-slate-100/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-transparent';
              if (status === 'complete') {
                colorClasses =
                  'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 font-semibold';
              } else if (status === 'partial') {
                colorClasses =
                  'bg-amber-400/20 text-amber-800 dark:text-amber-300 border-amber-400/40 font-semibold';
              } else if (status === 'missed') {
                colorClasses =
                  'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 font-semibold';
              }

              const ringClass = isSelected
                ? 'ring-2 ring-indigo-500 border-indigo-500'
                : isToday
                ? 'ring-1 ring-slate-400 dark:ring-slate-500'
                : '';

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDayKey(key)}
                  className={`h-9 rounded-lg text-xs border transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center tabular-nums ${colorClasses} ${ringClass}`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                Tudo certo
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-400" />
                Parcial
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
                Errou o dia
              </span>
            </div>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {streak}d sem errar
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 capitalize">
                {formatFullPtDate(selectedDayKey)}
              </span>
              <span
                className={`text-[11px] font-semibold shrink-0 ${
                  selectedDayStatus === 'complete'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : selectedDayStatus === 'partial'
                    ? 'text-amber-600 dark:text-amber-400'
                    : selectedDayStatus === 'missed'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {selectedDayStatus === 'complete'
                  ? 'Tudo certo'
                  : selectedDayStatus === 'partial'
                  ? 'Parcial'
                  : selectedDayStatus === 'missed'
                  ? 'Errou o dia'
                  : 'Sem registro'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedDayLogs.length > 0
                ? `${selectedDayLogs.length} ${
                    selectedDayLogs.length === 1 ? 'conclusão registrada' : 'conclusões registradas'
                  } com horário:`
                : 'Nenhuma conclusão com horário registrada neste dia.'}
            </p>
            {selectedDayLogs.length > 0 && (
              <ul className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {selectedDayLogs.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80"
                  >
                    <span className="font-medium text-slate-700 dark:text-slate-200 truncate pr-2">
                      {log.title}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-indigo-600 dark:text-indigo-400 shrink-0">
                      {log.timeStr}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </motion.section>

        {/* RIGHT COLUMN: Analytics Sidebar */}
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.1, ease: 'easeOut' }}
          className="xl:col-span-4 bg-[#0b1020] text-slate-100 border border-indigo-950/80 rounded-2xl p-4 sm:p-5 space-y-4 relative"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAnalyticsFilterTaskId('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                analyticsFilterTaskId === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              Todos
            </button>
            {tasks.slice(0, 6).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAnalyticsFilterTaskId(t.id)}
                className={`max-w-[130px] truncate px-2.5 py-1.5 rounded-lg text-xs cursor-pointer ${
                  analyticsFilterTaskId === t.id
                    ? 'font-semibold bg-indigo-600 text-white'
                    : 'font-medium bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                {t.title}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div>
              <p className="text-sm sm:text-base font-bold text-white tracking-tight tabular-nums">
                {analytics.totalInPeriod}{' '}
                {analytics.totalInPeriod === 1 ? 'tarefa' : 'tarefas'} {analytics.periodLabelText}
              </p>
              <p className="text-[11px] text-slate-400">
                {selectedFilterTask
                  ? `Filtrando por: ${selectedFilterTask.title}`
                  : 'Mostrando todas as tarefas concluídas com horário'}
              </p>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-slate-900/90 border border-slate-800 text-xs shrink-0">
              {(['week', 'month', 'year'] as AnalyticsRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAnalyticsRange(r)}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    analyticsRange === r
                      ? 'font-semibold bg-indigo-600 text-white'
                      : 'font-medium text-slate-400 hover:text-white'
                  }`}
                >
                  {r === 'week' ? 'Semana' : r === 'month' ? 'Mês' : 'Ano'}
                </button>
              ))}
            </div>
          </div>

          <div
            ref={heatmapContainerRef}
            className="rounded-xl bg-slate-950/75 border border-slate-800/90 p-3.5 relative"
          >
            <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium text-slate-400 mb-1.5">
              {analytics.monthHeaders.map((label, i) => (
                <span key={`mh-${i}`}>{label}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {analytics.visibleCells.map((dayKey) => {
                const c = analytics.countByDay[dayKey] || 0;
                const dayEntries = analytics.logsByDay[dayKey] || [];
                const dt = parseDateKey(dayKey);
                return (
                  <button
                    key={dayKey}
                    type="button"
                    onMouseEnter={(ev) => openTooltip(ev, dayKey, dayEntries)}
                    onMouseMove={(ev) => openTooltip(ev, dayKey, dayEntries)}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setSelectedDayKey(dayKey);
                      openTooltip(ev, dayKey, dayEntries);
                    }}
                    className={
                      analyticsRange === 'year'
                        ? `h-4 rounded-xs border transition-transform hover:scale-110 cursor-pointer ${getIntensityClass(c)}`
                        : `h-7 rounded-md border text-[11px] tabular-nums transition-transform hover:scale-105 cursor-pointer flex items-center justify-center ${getIntensityClass(c)}`
                    }
                  >
                    {analyticsRange === 'year' ? '' : dt.getDate()}
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {tooltip && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 4 }}
                  transition={{ duration: 0.14 }}
                  style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
                  className="fixed z-40 pointer-events-none max-w-[260px] rounded-xl bg-slate-900 text-white border border-indigo-500/40 shadow-xl px-3 py-2 text-xs space-y-1"
                >
                  <div className="font-bold text-white tabular-nums">
                    {tooltip.logs.length} {tooltip.logs.length === 1 ? 'tarefa' : 'tarefas'} em{' '}
                    {formatShortPtDate(tooltip.dayKey)}
                  </div>
                  <div className="text-[11px] text-slate-300 leading-snug">
                    {tooltip.logs.length > 0
                      ? tooltip.logs
                          .slice(0, 5)
                          .map((l) => `${l.timeStr} — ${l.title}`)
                          .join(' • ')
                      : 'Nenhuma tarefa concluída'}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div className="rounded-xl bg-slate-950/65 border border-slate-800/80 p-3">
              <p className="text-[11px] text-slate-400">Total</p>
              <p className="text-xl font-extrabold text-indigo-400 mt-0.5 tabular-nums">
                {analytics.totalInPeriod}{' '}
                <span className="text-xs font-medium text-slate-300">tarefas</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">{analytics.periodLabelText}</p>
            </div>

            <div className="rounded-xl bg-slate-950/65 border border-slate-800/80 p-3">
              <p className="text-[11px] text-slate-400">Dia mais cheio</p>
              <p className="text-xl font-extrabold text-indigo-400 mt-0.5 tabular-nums">
                {analytics.busiestCount}{' '}
                <span className="text-xs font-medium text-slate-300">tarefas</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {analytics.busiestKey ? formatShortPtDate(analytics.busiestKey) : '—'}
              </p>
            </div>

            <div className="rounded-xl bg-slate-950/65 border border-slate-800/80 p-3">
              <p className="text-[11px] text-slate-400">Maior série com algo marcado</p>
              <p className="text-xl font-extrabold text-indigo-400 mt-0.5 tabular-nums">
                {analytics.bestStreak}{' '}
                <span className="text-xs font-medium text-slate-300">dias</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {analytics.bestStart && analytics.bestEnd
                  ? `${formatShortPtDate(analytics.bestStart)} a ${formatShortPtDate(analytics.bestEnd)}`
                  : '—'}
              </p>
            </div>

            <div className="rounded-xl bg-slate-950/65 border border-slate-800/80 p-3">
              <p className="text-[11px] text-slate-400">Dias seguidos com algo marcado</p>
              <p className="text-xl font-extrabold text-indigo-400 mt-0.5 tabular-nums">
                {analytics.currentMarkedStreak}{' '}
                <span className="text-xs font-medium text-slate-300">dias</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {analytics.currentMarkedStreak > 0 ? 'constância ativa' : 'marque uma tarefa hoje'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>Toque ou passe o mouse num dia para ver os horários</span>
            <div className="flex items-center gap-1">
              <span>Menos</span>
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-800" />
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-950 border border-indigo-800/60" />
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-700" />
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500" />
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-400" />
              <span>Mais</span>
            </div>
          </div>
        </motion.aside>
      </div>
    </main>
  );
}
