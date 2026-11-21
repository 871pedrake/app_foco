export type MainTab = 'tasks' | 'levels' | 'journal' | 'vices' | 'impulseHistory' | 'profile';
export type TaskType = 'daily' | 'once';
export type DailyStatus = 'complete' | 'partial' | 'missed';
export type AnalyticsRange = 'week' | 'month' | 'year';
export type JournalMood = 'Incrível' | 'Bom' | 'Normal' | 'Difícil' | 'Pesado';

export interface LevelDefinition {
  level: number;
  title: string;
  stage: string;
  minXp: number;
  summary: string;
  description: string;
  milestoneTip: string;
}

export interface XpProgressSummary {
  totalXp: number;
  currentLevel: LevelDefinition;
  nextLevel: LevelDefinition | null;
  xpIntoCurrentLevel: number;
  xpRequiredForNextLevel: number;
  xpRemainingToNext: number;
  progressPercent: number;
  isMaxLevel: boolean;
}

export interface SkillTierInfo {
  xp: number;
  tierName: string;
  nextTierXp: number | null;
  progressPercent: number;
}

export interface NavbarXpNotification {
  id: number;
  delta: number;
  source: 'task' | 'journal' | 'vice';
  leveledUpTo?: number | null;
  leveledDownTo?: number | null;
}

export interface UserProfile {
  name: string;
  photoDataUrl: string | null;
  updatedAt: number;
}

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  completed: boolean;
  completedDate: string | null;
  completedTime: string | null;
  completions: number;
  createdAt: number;
  timerMinutes?: number | null;
}

export interface ActiveTaskTimer {
  taskId: string;
  totalSeconds: number;
  remainingSeconds: number;
  endTimeMs: number | null;
  isRunning: boolean;
}

export interface CompletionLog {
  id: string;
  taskId: string;
  title: string;
  type: TaskType;
  dateKey: string;
  timeStr: string;
  timestamp: number;
  preserved?: boolean;
}

export interface JournalEntry {
  dump: string;
  gratitude: string;
  mood: JournalMood;
  updatedAt: number;
}

export interface RelapseRecord {
  id: string;
  dateKey: string;
  timeStr?: string;
  trigger: string;
  context: string;
  plan: string;
}

export interface Vice {
  id: string;
  name: string;
  streakStartKey: string;
  bestStreak: number;
  relapses: RelapseRecord[];
}

export interface SlipReflectionState {
  viceId: string;
  logId: string;
  trigger: string;
  plan: string;
}

export interface ImpulseLog {
  id: string;
  thought: string;
  actionTaken: string;
  breathingCycles: number;
  completedExercise: boolean;
  dateKey: string;
  timeStr: string;
  timestamp: number;
}

export interface RelaxingSong {
  id: string;
  title: string;
  subtitle: string;
  stepIntervalMs: number;
  chordSteps: number[][];
  melodyScale: number[];
  melodyPattern: (number | null)[];
  padWaveform: OscillatorType;
  melodyWaveform: OscillatorType;
  filterCutoffHz: number;
  reverbMix: number;
  loopsPerTrack: number;
  /** Timbre da melodia gerada ao vivo. */
  melodyTimbre?: 'soft' | 'keys' | 'bell' | 'pluck';
  /** Chance (0–1) de cada subtempo receber uma nota. */
  melodyDensity?: number;
}

export interface BackgroundSoundscape {
  id: string;
  title: string;
  subtitle: string;
  durationMs: number;
  kind:
    | 'gentle-rain'
    | 'rain-thunder'
    | 'night-creatures'
    | 'cozy-fireplace'
    | 'ocean-waves'
    | 'forest-stream';
}

export interface AudioStatusSnapshot {
  musicEnabled: boolean;
  rainEnabled: boolean;
  sfxEnabled: boolean;
  musicVolume: number;
  rainVolume: number;
  currentSongIndex: number;
  currentSong: RelaxingSong;
  currentSoundscapeIndex: number;
  currentSoundscape: BackgroundSoundscape;
  customTrackName: string | null;
  isAudioUnlocked: boolean;
  isPlayingMusic: boolean;
  isPlayingRain: boolean;
}

export const STORAGE_KEYS = {
  TASKS: 'foco_minimal_tasks_v1',
  HISTORY: 'foco_minimal_history_v1',
  COMPLETION_LOGS: 'foco_minimal_completion_logs_v1',
  TOTAL_XP: 'foco_minimal_total_xp_v1',
  XP_BY_DATE: 'foco_minimal_xp_by_date_v1',
  LAST_ACTIVE_DAY: 'foco_last_active_day_v1',
  JOURNAL: 'foco_minimal_journal_v1',
  VICES: 'foco_minimal_vices_v1',
  IMPULSE_LOGS: 'foco_minimal_impulse_logs_v1',
  PROFILE: 'foco_minimal_profile_v1',
  THEME: 'foco_minimal_theme_v1',
  SFX: 'foco_minimal_sfx_v1',
  BGM: 'foco_minimal_bgm_v1',
  RAIN: 'foco_minimal_rain_v1',
  BGM_VOL: 'foco_minimal_bgm_vol_v1',
  RAIN_VOL: 'foco_minimal_rain_vol_v1',
} as const;

export const RELAPSE_TRIGGERS = [
  'Ansiedade',
  'Tédio',
  'Frustração',
  'Solidão',
  'Estresse',
  'Cansaço',
] as const;

export const RELAPSE_ACTION_PLANS = [
  'faço 20 flexões',
  'tomo um banho gelado',
  'saio pra caminhar',
  'ligo pra alguém',
  'Outro',
] as const;

export const JOURNAL_MOODS: { label: JournalMood; emoji: string }[] = [
  { label: 'Incrível', emoji: '😄' },
  { label: 'Bom', emoji: '🙂' },
  { label: 'Normal', emoji: '😐' },
  { label: 'Difícil', emoji: '😕' },
  { label: 'Pesado', emoji: '😫' },
];
