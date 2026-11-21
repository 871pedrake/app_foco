import type { DailyStatus, Task } from '../types/foco';

export function formatDateKey(dateObj: Date): string {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date {
  const parts = String(key || '').split('-').map(Number);
  const y = Number.isFinite(parts[0]) && parts[0] > 0 ? parts[0] : 2026;
  const m = Number.isFinite(parts[1]) && parts[1] >= 1 && parts[1] <= 12 ? parts[1] : 1;
  const d = Number.isFinite(parts[2]) && parts[2] >= 1 && parts[2] <= 31 ? parts[2] : 1;
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function shiftDateKey(key: string, deltaDays: number): string {
  const dt = parseDateKey(key);
  dt.setDate(dt.getDate() + deltaDays);
  return formatDateKey(dt);
}

export function getLocalTodayKey(now: Date = new Date()): string {
  return formatDateKey(now);
}

export function getLocalTimeStr(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function formatShortPtDate(key: string): string {
  const dt = parseDateKey(key);
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

export function formatFullPtDate(key: string): string {
  const dt = parseDateKey(key);
  return dt.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function getCountdownToMidnight(now: Date = new Date()): { hours: number; minutes: number } {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  const diffMs = Math.max(0, midnight.getTime() - now.getTime());
  const totalMins = Math.floor(diffMs / 60000);
  return {
    hours: Math.floor(totalMins / 60),
    minutes: totalMins % 60,
  };
}

export function generateId(): string {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function evaluateDailyStatus(dailyTasks: Task[]): DailyStatus | null {
  if (!Array.isArray(dailyTasks) || dailyTasks.length === 0) return null;
  const doneCount = dailyTasks.filter((t) => t.completed).length;
  if (doneCount === dailyTasks.length) return 'complete';
  if (doneCount > 0) return 'partial';
  return 'missed';
}

export function calculateCleanStreak(
  historyByDate: Record<string, DailyStatus>,
  todayKey: string = getLocalTodayKey()
): number {
  let streak = 0;
  let cursor = todayKey;

  for (let i = 0; i < 365; i += 1) {
    const status = historyByDate[cursor];
    if (status === 'complete' || status === 'partial') {
      streak += 1;
      cursor = shiftDateKey(cursor, -1);
    } else if (status === 'missed') {
      if (i === 0) {
        // Today isn't over yet; check consecutive streak ending yesterday
        cursor = shiftDateKey(cursor, -1);
        continue;
      }
      break;
    } else {
      if (i === 0) {
        cursor = shiftDateKey(cursor, -1);
        continue;
      }
      break;
    }
  }
  return streak;
}

export function formatTimerClock(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function sanitizeTask(
  raw: unknown,
  fallbackTodayKey: string = getLocalTodayKey(),
  fallbackTimeStr: string = getLocalTimeStr()
): Task | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.title !== 'string') return null;
  const title = obj.title.trim();
  if (!title) return null;

  const type = obj.type === 'once' ? 'once' : 'daily';
  const completed = Boolean(obj.completed);
  const rawCompletions = Number(obj.completions);
  const completions = Number.isFinite(rawCompletions)
    ? Math.max(0, Math.floor(rawCompletions))
    : completed
    ? 1
    : 0;
  const rawCreatedAt = Number(obj.createdAt);
  const rawTimerMinutes = Number(obj.timerMinutes);
  const timerMinutes =
    Number.isFinite(rawTimerMinutes) && rawTimerMinutes >= 1
      ? Math.min(180, Math.floor(rawTimerMinutes))
      : null;

  return {
    id: typeof obj.id === 'string' && obj.id ? obj.id : generateId(),
    title,
    type,
    completed,
    completedDate: completed
      ? typeof obj.completedDate === 'string' && obj.completedDate
        ? obj.completedDate
        : fallbackTodayKey
      : null,
    completedTime: completed
      ? typeof obj.completedTime === 'string' && obj.completedTime
        ? obj.completedTime
        : fallbackTimeStr
      : null,
    completions,
    createdAt: Number.isFinite(rawCreatedAt) ? rawCreatedAt : Date.now(),
    timerMinutes,
  };
}
