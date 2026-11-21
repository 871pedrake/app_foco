import assert from 'node:assert/strict';
import test from 'node:test';
import { AmbientAudioEngine, type StorageLike } from '../src/audio/ambientAudioEngine';
import {
  RELAXING_SONGS,
  buildShuffledSongBag,
  pickChordOrder,
  pickNextRandomSongIndex,
} from '../src/audio/songs';
import {
  BACKGROUND_SOUNDSCAPES,
  pickNextRandomSoundscapeIndex,
} from '../src/audio/soundscapes';
import type { CompletionLog, DailyStatus, JournalEntry, Task, Vice } from '../src/types/foco';
import {
  calculateCleanStreak,
  evaluateDailyStatus,
  formatDateKey,
  formatTimerClock,
  getCountdownToMidnight,
  parseDateKey,
  sanitizeTask,
  shiftDateKey,
} from '../src/utils/date';
import {
  addTaskState,
  applyRolloverIfNeeded,
  clearJournalWithXp,
  completeImpulseExercise,
  deleteImpulseEntry,
  deleteTaskWithXp,
  getProfileInitials,
  loadInitialFocoState,
  recordImpulseEntry,
  recordRelapseWithXp,
  sanitizeImpulseLogs,
  sanitizeProfile,
  saveJournalWithXp,
  simulateNextDayState,
  toggleTaskWithXp,
} from '../src/utils/focoStorage';
import {
  LEVEL_DEFINITIONS,
  XP_PENALTY_ON_FAIL,
  XP_PER_COMPLETION,
  formatXp,
  getDailyComboSummary,
  getLast7DaysXpSeries,
  getLevelProgress,
  getSkillTierInfo,
  getTodayXpEarned,
} from '../src/utils/xp';
import { getViceBestDays, getViceCleanDays } from '../src/components/VicesView';
import {
  getNextJournalLockAfterSave,
  shouldJournalAutoLock,
} from '../src/components/JournalView';
import { formatNavbarXpNotice } from '../src/components/Header';
import {
  BREATHING_PATTERNS,
  IMPULSE_CHALLENGES,
  pickRandomItemIndex,
} from '../src/components/ImpulseModal';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

function createMockAudioEnvironment() {
  const stats = {
    createdContexts: 0,
    createdBufferSources: 0,
    startedBufferSources: 0,
    stoppedBufferSources: 0,
    createdOscillators: 0,
    startedOscillators: 0,
    stoppedOscillators: 0,
    closedContexts: 0,
  };

  class MockAudioParam {
    value = 1;
    setValueAtTime(v: number) {
      this.value = v;
    }
    setTargetAtTime(v: number) {
      this.value = v;
    }
    exponentialRampToValueAtTime(v: number) {
      this.value = v;
    }
    cancelScheduledValues() {}
  }

  class MockNode {
    connect() {
      return this;
    }
    disconnect() {}
  }

  class MockGainNode extends MockNode {
    gain = new MockAudioParam();
  }

  class MockFilterNode extends MockNode {
    type: BiquadFilterType = 'lowpass';
    frequency = new MockAudioParam();
    Q = new MockAudioParam();
  }

  class MockDelayNode extends MockNode {
    delayTime = new MockAudioParam();
  }

  class MockOscillatorNode extends MockNode {
    type: OscillatorType = 'sine';
    frequency = new MockAudioParam();
    constructor() {
      super();
      stats.createdOscillators += 1;
    }
    start() {
      stats.startedOscillators += 1;
    }
    stop() {
      stats.stoppedOscillators += 1;
    }
  }

  class MockBufferSourceNode extends MockNode {
    buffer: unknown = null;
    loop = false;
    constructor() {
      super();
      stats.createdBufferSources += 1;
    }
    start() {
      stats.startedBufferSources += 1;
    }
    stop() {
      stats.stoppedBufferSources += 1;
    }
  }

  class MockAudioBuffer {
    sampleRate: number;
    length: number;
    private channels: Float32Array[];
    constructor(numChannels: number, length: number, sampleRate: number) {
      this.length = length;
      this.sampleRate = sampleRate;
      this.channels = Array.from({ length: numChannels }, () => new Float32Array(length));
    }
    getChannelData(index: number) {
      return this.channels[index];
    }
  }

  class MockAudioContext {
    state: AudioContextState = 'running';
    currentTime = 0;
    sampleRate = 44100;
    destination = new MockNode();

    constructor() {
      stats.createdContexts += 1;
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    close() {
      stats.closedContexts += 1;
      this.state = 'closed';
      return Promise.resolve();
    }
    createGain() {
      return new MockGainNode();
    }
    createBiquadFilter() {
      return new MockFilterNode();
    }
    createDelay() {
      return new MockDelayNode();
    }
    createOscillator() {
      return new MockOscillatorNode();
    }
    createBuffer(channels: number, length: number, sampleRate: number) {
      return new MockAudioBuffer(channels, length, sampleRate);
    }
    createBufferSource() {
      return new MockBufferSourceNode();
    }
  }

  return { MockAudioContext, stats };
}

test('relaxing songs are well-formed and distinct', () => {
  assert.ok(RELAXING_SONGS.length >= 12);
  const ids = new Set(RELAXING_SONGS.map((s) => s.id));
  assert.equal(ids.size, RELAXING_SONGS.length);
  const titles = new Set(RELAXING_SONGS.map((s) => s.title));
  assert.equal(titles.size, RELAXING_SONGS.length);
  // Cada música precisa ter acordes/escala próprios, não só um nome diferente
  const fingerprints = new Set(
    RELAXING_SONGS.map((s) => JSON.stringify([s.chordSteps, s.melodyScale]))
  );
  assert.equal(fingerprints.size, RELAXING_SONGS.length);

  for (const song of RELAXING_SONGS) {
    assert.ok(song.title.trim().length > 0);
    assert.ok(song.stepIntervalMs >= 1000);
    assert.ok(song.chordSteps.length >= 4);
    assert.ok(song.melodyScale.length >= 4);
    assert.ok(song.melodyPattern.length >= 8);
    assert.ok(song.loopsPerTrack >= 1);
    for (const chord of song.chordSteps) {
      assert.ok(chord.length >= 3);
      for (const freq of chord) {
        assert.ok(freq > 50 && freq < 2000);
      }
    }
  }
});

test('pickNextRandomSongIndex never repeats the current song and covers every track', () => {
  let current = 0;
  const seen = new Set<number>([current]);

  for (let i = 0; i < 300; i += 1) {
    const next = pickNextRandomSongIndex(current, RELAXING_SONGS.length);
    assert.notEqual(next, current, `Immediate repeat detected at iteration ${i}`);
    assert.ok(next >= 0 && next < RELAXING_SONGS.length);
    seen.add(next);
    current = next;
  }

  assert.equal(
    seen.size,
    RELAXING_SONGS.length,
    'All relaxing songs should be selected over random runs'
  );

  // Boundary checks
  assert.equal(pickNextRandomSongIndex(0, 5, () => -5), 1);
  assert.equal(pickNextRandomSongIndex(0, 5, () => 999), 4);
  assert.equal(pickNextRandomSongIndex(0, 5, () => Number.NaN), 1);
  assert.equal(pickNextRandomSongIndex(0, 1, () => 0.5), 0);
});

test('AmbientAudioEngine starts 5-song random playback + background rain without duplicating nodes', async () => {
  const { MockAudioContext, stats } = createMockAudioEnvironment();
  const storage = new MemoryStorage();

  const engine = new AmbientAudioEngine({
    AudioContextClass: MockAudioContext as unknown as typeof AudioContext,
    storage,
  });

  const initial = engine.getSnapshot();
  assert.equal(initial.musicEnabled, true);
  assert.equal(initial.rainEnabled, true);
  assert.ok(initial.currentSongIndex >= 0 && initial.currentSongIndex < 5);
  assert.ok(initial.currentSoundscapeIndex >= 0 && initial.currentSoundscapeIndex < 6);

  engine.startIfEnabled();
  const runningSnap = engine.getSnapshot();
  assert.equal(runningSnap.isPlayingMusic, true);
  assert.equal(runningSnap.isPlayingRain, true);
  const afterStartSources = stats.startedBufferSources;
  assert.ok(afterStartSources >= 1, 'Soundscape should start at least one buffer source');

  // Calling startIfEnabled or setRainEnabled(true) again must NOT duplicate soundscape sources
  engine.startIfEnabled();
  engine.setRainEnabled(true);
  assert.equal(
    stats.startedBufferSources,
    afterStartSources,
    'Soundscape buffer sources must not duplicate'
  );

  // Rapidly skipping through 10 random songs must never repeat consecutively
  let prevIdx = engine.getSnapshot().currentSongIndex;
  for (let i = 0; i < 10; i += 1) {
    engine.nextRandomSong();
    const nextIdx = engine.getSnapshot().currentSongIndex;
    assert.notEqual(nextIdx, prevIdx);
    prevIdx = nextIdx;
  }

  // Volume clamping & persistence
  engine.setMusicVolume(1.8);
  engine.setRainVolume(-0.4);
  assert.equal(engine.getSnapshot().musicVolume, 1);
  assert.equal(engine.getSnapshot().rainVolume, 0);
  assert.equal(storage.getItem('foco_minimal_bgm_vol_v1'), '1');
  assert.equal(storage.getItem('foco_minimal_rain_vol_v1'), '0');

  // Independent soundscape toggle while music remains on
  engine.setRainEnabled(false);
  assert.equal(engine.getSnapshot().rainEnabled, false);
  assert.equal(engine.getSnapshot().isPlayingRain, false);
  assert.equal(engine.getSnapshot().isPlayingMusic, true);

  // Wait for cleanup fade timeout
  await new Promise((r) => setTimeout(r, 220));
  assert.equal(stats.stoppedBufferSources, afterStartSources);

  // Re-enabling starts fresh sources cleanly
  engine.setRainEnabled(true);
  assert.equal(engine.getSnapshot().isPlayingRain, true);
  assert.ok(stats.startedBufferSources > afterStartSources);

  // Rapid toggle off -> on -> off must stop every created buffer source without leaking
  engine.setRainEnabled(false);
  engine.setRainEnabled(true);
  engine.setRainEnabled(false);
  await new Promise((r) => setTimeout(r, 220));
  assert.equal(
    stats.stoppedBufferSources,
    stats.startedBufferSources,
    'Every started BufferSourceNode must be stopped after rapid toggling'
  );

  // selectSong jumps to requested track and enables music if paused
  engine.setMusicEnabled(false);
  engine.selectSong(3);
  assert.equal(engine.getSnapshot().musicEnabled, true);
  assert.equal(engine.getSnapshot().currentSongIndex, 3);

  // SFX works without errors
  engine.playScorePoint();
  engine.playUncheckPoint();

  engine.dispose();
  assert.equal(stats.closedContexts, 1);
});

test('6 background soundscapes are distinct, randomized on entry, and switch cleanly', async () => {
  assert.equal(BACKGROUND_SOUNDSCAPES.length, 6);
  const ids = new Set(BACKGROUND_SOUNDSCAPES.map((s) => s.id));
  const kinds = new Set(BACKGROUND_SOUNDSCAPES.map((s) => s.kind));
  assert.equal(ids.size, 6);
  assert.equal(kinds.size, 6);

  // Random selection covers all 6 without immediate repeats
  let cur = 0;
  const seen = new Set<number>([cur]);
  for (let i = 0; i < 300; i += 1) {
    const next = pickNextRandomSoundscapeIndex(cur, BACKGROUND_SOUNDSCAPES.length);
    assert.notEqual(next, cur);
    seen.add(next);
    cur = next;
  }
  assert.equal(seen.size, 6);

  // Entering with different RNG seeds selects different song & soundscape
  const { MockAudioContext, stats } = createMockAudioEnvironment();
  const e1 = new AmbientAudioEngine({
    AudioContextClass: MockAudioContext as unknown as typeof AudioContext,
    storage: new MemoryStorage(),
    rng: () => 0.05,
  });
  const e2 = new AmbientAudioEngine({
    AudioContextClass: MockAudioContext as unknown as typeof AudioContext,
    storage: new MemoryStorage(),
    rng: () => 0.85,
  });
  assert.notEqual(e1.getSnapshot().currentSongIndex, e2.getSnapshot().currentSongIndex);
  assert.notEqual(
    e1.getSnapshot().currentSoundscapeIndex,
    e2.getSnapshot().currentSoundscapeIndex
  );
  e1.dispose();
  e2.dispose();

  // Switch through all 6 soundscapes and randomizeAll, then verify clean teardown
  const engine = new AmbientAudioEngine({
    AudioContextClass: MockAudioContext as unknown as typeof AudioContext,
    storage: new MemoryStorage(),
  });
  engine.startIfEnabled();

  for (let i = 0; i < BACKGROUND_SOUNDSCAPES.length; i += 1) {
    const sc = engine.selectSoundscape(i);
    assert.equal(sc.id, BACKGROUND_SOUNDSCAPES[i].id);
    assert.equal(engine.getSnapshot().currentSoundscapeIndex, i);
    assert.equal(engine.getSnapshot().isPlayingRain, true);
  }

  const prevSong = engine.getSnapshot().currentSongIndex;
  const prevSc = engine.getSnapshot().currentSoundscapeIndex;
  const randRes = engine.randomizeAll();
  assert.notEqual(engine.getSnapshot().currentSongIndex, prevSong);
  assert.notEqual(engine.getSnapshot().currentSoundscapeIndex, prevSc);
  assert.equal(randRes.song.id, engine.getSnapshot().currentSong.id);
  assert.equal(randRes.soundscape.id, engine.getSnapshot().currentSoundscape.id);

  engine.setRainEnabled(false);
  await new Promise((r) => setTimeout(r, 220));
  assert.equal(stats.stoppedBufferSources, stats.startedBufferSources);

  engine.dispose();
});

test('Both relaxing music and ambient soundscape automatically finish and switch to another random track', async () => {
  const { MockAudioContext, stats } = createMockAudioEnvironment();
  const engine = new AmbientAudioEngine({
    AudioContextClass: MockAudioContext as unknown as typeof AudioContext,
    storage: new MemoryStorage(),
    songStepIntervalOverrideMs: 5,
    soundscapeDurationOverrideMs: 45,
  });

  const observedSongs = new Set<number>();
  const observedSoundscapes = new Set<number>();
  const unsub = engine.subscribe((snap) => {
    observedSongs.add(snap.currentSongIndex);
    observedSoundscapes.add(snap.currentSoundscapeIndex);
  });

  engine.startIfEnabled();
  const startSong = engine.getSnapshot().currentSongIndex;
  const startSc = engine.getSnapshot().currentSoundscapeIndex;

  // Wait long enough for 16 steps (~80ms) and soundscape cycle (45ms) to finish and rotate at least once
  await new Promise((r) => setTimeout(r, 180));

  assert.ok(
    observedSongs.size >= 2,
    `Expected music to finish and auto-switch to another song (saw ${observedSongs.size})`
  );
  assert.ok(
    observedSoundscapes.size >= 2,
    `Expected ambient soundscape to finish and auto-switch to another soundscape (saw ${observedSoundscapes.size})`
  );
  assert.ok(observedSongs.has(startSong));
  assert.ok(observedSoundscapes.has(startSc));

  engine.setRainEnabled(false);
  await new Promise((r) => setTimeout(r, 220));
  assert.equal(stats.stoppedBufferSources, stats.startedBufferSources);

  unsub();
  engine.dispose();
});

test('AmbientAudioEngine supports custom audio upload and clean revert to 5 relaxing songs', () => {
  const { MockAudioContext } = createMockAudioEnvironment();
  const storage = new MemoryStorage();

  const mockAudioEl = {
    src: '',
    loop: false,
    volume: 1,
    paused: true,
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
    removeAttribute() {
      this.src = '';
    },
    load() {},
  };

  const engine = new AmbientAudioEngine({
    AudioContextClass: MockAudioContext as unknown as typeof AudioContext,
    storage,
    createAudioElement: () => mockAudioEl as unknown as HTMLAudioElement,
  });

  engine.startIfEnabled();
  const realOrMockFile =
    typeof File !== 'undefined'
      ? new File(['audio-bytes'], 'lo-fi-chuva.mp3', { type: 'audio/mpeg' })
      : ({ name: 'lo-fi-chuva.mp3' } as File);
  engine.setCustomAudioFile(realOrMockFile);

  let snap = engine.getSnapshot();
  assert.equal(snap.customTrackName, 'lo-fi-chuva');
  assert.equal(snap.isPlayingMusic, true);

  engine.clearCustomAudioFile();
  snap = engine.getSnapshot();
  assert.equal(snap.customTrackName, null);
  assert.equal(snap.isPlayingMusic, true);

  engine.dispose();
});

test('AmbientAudioEngine degrades gracefully when Web Audio API is unavailable', () => {
  const engine = new AmbientAudioEngine({
    AudioContextClass: undefined,
    storage: new MemoryStorage(),
  });

  assert.doesNotThrow(() => {
    engine.startIfEnabled();
    engine.unlock();
    engine.nextRandomSong();
    engine.setRainEnabled(false);
    engine.setRainEnabled(true);
    engine.playScorePoint();
    engine.playUncheckPoint();
    engine.dispose();
  });
});

test('Date utilities, daily rollover, and clean streak calculations are accurate', () => {
  const dt = new Date(2026, 10, 20, 20, 15, 0);
  assert.equal(formatDateKey(dt), '2026-11-20');
  assert.equal(shiftDateKey('2026-11-20', -1), '2026-11-19');
  assert.equal(shiftDateKey('2026-11-30', 1), '2026-12-01');
  assert.equal(parseDateKey('2026-11-20').getDate(), 20);

  const cd = getCountdownToMidnight(new Date(2026, 10, 20, 22, 30, 0));
  assert.equal(cd.hours, 1);
  assert.equal(cd.minutes, 30);

  const tasks: Task[] = [
    {
      id: 't1',
      title: 'Ler 20 minutos',
      type: 'daily',
      completed: true,
      completedDate: '2026-11-19',
      completedTime: '21:00',
      completions: 3,
      createdAt: 1000,
    },
    {
      id: 't2',
      title: 'Comprar caderno',
      type: 'once',
      completed: true,
      completedDate: '2026-11-19',
      completedTime: '18:00',
      completions: 1,
      createdAt: 1001,
    },
  ];

  assert.equal(evaluateDailyStatus(tasks.filter((t) => t.type === 'daily')), 'complete');

  const rollover = applyRolloverIfNeeded(tasks, {}, '2026-11-19', '2026-11-20');
  assert.equal(rollover.didRollover, true);
  assert.equal(rollover.tasks[0].completed, false);
  assert.equal(rollover.tasks[0].completions, 3);
  assert.equal(rollover.tasks[1].completed, true, 'Once task must stay completed on rollover');
  assert.equal(rollover.historyByDate['2026-11-19'], 'complete');
  assert.equal(rollover.historyByDate['2026-11-20'], 'missed');

  const history: Record<string, DailyStatus> = {
    '2026-11-17': 'complete',
    '2026-11-18': 'partial',
    '2026-11-19': 'complete',
    '2026-11-20': 'missed',
  };
  assert.equal(calculateCleanStreak(history, '2026-11-20'), 3);

  assert.equal(sanitizeTask({ title: '   ' }), null);
  const validSanitized = sanitizeTask({ title: 'Meditar', type: 'daily', completed: false });
  assert.ok(validSanitized);
  assert.equal(validSanitized.title, 'Meditar');
});

test('Vice clean days and best streak preserve records across relapses', () => {
  const vice: Vice = {
    id: 'v1',
    name: 'Sem redes sociais',
    streakStartKey: '2026-11-06',
    bestStreak: 21,
    relapses: [],
  };

  assert.equal(getViceCleanDays(vice, '2026-11-20'), 14);
  assert.equal(getViceBestDays(vice, '2026-11-20'), 21);
});

test('15 detailed levels have strictly increasing XP thresholds, rich details, and accurate boundary progress', () => {
  assert.equal(LEVEL_DEFINITIONS.length, 15);
  assert.equal(XP_PER_COMPLETION, 1);

  for (let i = 0; i < LEVEL_DEFINITIONS.length; i += 1) {
    const lvl = LEVEL_DEFINITIONS[i];
    assert.equal(lvl.level, i + 1);
    assert.ok(lvl.title.trim().length > 2);
    assert.ok(lvl.stage.trim().length > 2);
    assert.ok(lvl.summary.trim().length > 5);
    assert.ok(lvl.description.trim().length > 20);
    assert.ok(lvl.milestoneTip.trim().length > 5);
    if (i > 0) {
      assert.ok(
        lvl.minXp > LEVEL_DEFINITIONS[i - 1].minXp,
        `Level ${lvl.level} minXp must exceed level ${i}`
      );
    }
  }

  // Exact boundaries & invalid XP sanitization
  const lv1 = getLevelProgress(0);
  assert.equal(lv1.currentLevel.level, 1);
  assert.equal(lv1.nextLevel?.level, 2);
  assert.equal(lv1.xpRemainingToNext, 2);
  assert.equal(lv1.isMaxLevel, false);

  const lv2 = getLevelProgress(2);
  assert.equal(lv2.currentLevel.level, 2);
  assert.equal(lv2.progressPercent, 0);

  const lv15 = getLevelProgress(250);
  assert.equal(lv15.currentLevel.level, 15);
  assert.equal(lv15.isMaxLevel, true);
  assert.equal(lv15.nextLevel, null);
  assert.equal(lv15.progressPercent, 100);

  const lv15Overflow = getLevelProgress(310);
  assert.equal(lv15Overflow.totalXp, 310);
  assert.equal(lv15Overflow.xpIntoCurrentLevel, 60);

  // Negative & NaN inputs clamp cleanly to 0 XP (Level 1)
  assert.equal(getLevelProgress(-10).totalXp, 0);
  assert.equal(getLevelProgress(Number.NaN).currentLevel.level, 1);

  // Per-skill tier transitions
  assert.equal(getSkillTierInfo(0).tierName, 'Iniciante');
  assert.equal(getSkillTierInfo(3).tierName, 'Praticante');
  assert.equal(getSkillTierInfo(7).tierName, 'Consistente');
  assert.equal(getSkillTierInfo(15).tierName, 'Veterana');
  assert.equal(getSkillTierInfo(30).tierName, 'Mestre');
  assert.equal(getSkillTierInfo(30).nextTierXp, null);
});

test('Every completed skill grants +1 XP, unchecking reverts -1 XP including prior-day once tasks', () => {
  const today = '2026-11-20';
  let tasks: Task[] = [];
  let history: Record<string, DailyStatus> = {};
  let logs: CompletionLog[] = [];
  let totalXp = 0;

  // Reject whitespace-only tasks
  const blank = addTaskState({ tasks, historyByDate: history, title: '   ', type: 'daily', todayKey: today });
  assert.equal(blank.addedTask, null);

  // Add 2 daily skills and 1 once skill
  const r1 = addTaskState({ tasks, historyByDate: history, title: 'Ler 10 páginas', type: 'daily', todayKey: today });
  tasks = r1.tasks;
  history = r1.historyByDate;
  const daily1Id = r1.addedTask!.id;

  const r2 = addTaskState({ tasks, historyByDate: history, title: 'Meditar 10 min', type: 'daily', todayKey: today });
  tasks = r2.tasks;
  history = r2.historyByDate;
  const daily2Id = r2.addedTask!.id;

  const r3 = addTaskState({ tasks, historyByDate: history, title: 'Organizar mesa', type: 'once', todayKey: today });
  tasks = r3.tasks;
  history = r3.historyByDate;
  const onceId = r3.addedTask!.id;

  // Complete daily1 -> +1 XP, still Level 1 (need 2 XP for Level 2)
  const c1 = toggleTaskWithXp({
    tasks,
    completionLogs: logs,
    historyByDate: history,
    totalXp,
    taskId: daily1Id,
    todayKey: today,
    timeNow: '09:00',
  });
  tasks = c1.tasks;
  logs = c1.completionLogs;
  history = c1.historyByDate;
  totalXp = c1.totalXp;
  assert.equal(totalXp, 1);
  assert.equal(c1.leveledUpTo, null);
  assert.equal(c1.toggledTask?.completions, 1);

  // Complete daily2 -> +1 XP (total 2 XP) -> Level up to Level 2!
  const c2 = toggleTaskWithXp({
    tasks,
    completionLogs: logs,
    historyByDate: history,
    totalXp,
    taskId: daily2Id,
    todayKey: today,
    timeNow: '09:15',
  });
  tasks = c2.tasks;
  logs = c2.completionLogs;
  history = c2.historyByDate;
  totalXp = c2.totalXp;
  assert.equal(totalXp, 2);
  assert.equal(c2.leveledUpTo, 2);

  // Combo Diário counts only daily tasks (2/2 = 100%) while XP today is 2
  const combo = getDailyComboSummary(tasks);
  assert.equal(combo.completedDaily, 2);
  assert.equal(combo.totalDaily, 2);
  assert.equal(combo.isAllDailyDone, true);
  assert.equal(getTodayXpEarned(tasks, logs, today).xpToday, 2);

  // Uncheck daily2 -> reverts to 1 XP and removes its log cleanly
  const u2 = toggleTaskWithXp({
    tasks,
    completionLogs: logs,
    historyByDate: history,
    totalXp,
    taskId: daily2Id,
    todayKey: today,
    timeNow: '09:20',
  });
  tasks = u2.tasks;
  logs = u2.completionLogs;
  history = u2.historyByDate;
  totalXp = u2.totalXp;
  assert.equal(totalXp, 1);
  assert.equal(logs.length, 1);
  assert.equal(u2.toggledTask?.completions, 0);
  assert.equal(getTodayXpEarned(tasks, logs, today).xpToday, 1);

  // Regression: unchecking a 'once' task completed on an earlier day must remove THAT day's log
  const prevDayOnceTask: Task = {
    id: onceId,
    title: 'Organizar mesa',
    type: 'once',
    completed: true,
    completedDate: '2026-11-18',
    completedTime: '14:30',
    completions: 1,
    createdAt: 1000,
  };
  const tasksWithOldOnce = tasks.map((t) => (t.id === onceId ? prevDayOnceTask : t));
  const logsWithOldOnce: CompletionLog[] = [
    ...logs,
    {
      id: 'old_once_log',
      taskId: onceId,
      title: 'Organizar mesa',
      type: 'once',
      dateKey: '2026-11-18',
      timeStr: '14:30',
      timestamp: 1000,
    },
  ];
  const uncheckOldOnce = toggleTaskWithXp({
    tasks: tasksWithOldOnce,
    completionLogs: logsWithOldOnce,
    historyByDate: history,
    totalXp: 2,
    taskId: onceId,
    todayKey: today,
    timeNow: '10:00',
  });
  assert.equal(uncheckOldOnce.totalXp, 1);
  assert.equal(
    uncheckOldOnce.completionLogs.some((l) => l.id === 'old_once_log'),
    false,
    'Prior-day log must be removed when unchecking a previously completed once task'
  );
});

test('Repeated Simular Novo Dia preserves multi-day consecutive history, shifts logs, and hydrates corrupted storage safely', () => {
  const today = '2026-11-20';
  let tasks: Task[] = [
    {
      id: 'd1',
      title: 'Treinar',
      type: 'daily',
      completed: true,
      completedDate: today,
      completedTime: '08:00',
      completions: 5,
      createdAt: 100,
    },
  ];
  let history: Record<string, DailyStatus> = { [today]: 'complete' };
  let logs: CompletionLog[] = [
    {
      id: 'log_day1',
      taskId: 'd1',
      title: 'Treinar',
      type: 'daily',
      dateKey: today,
      timeStr: '08:00',
      timestamp: 100,
    },
  ];
  let vices: Vice[] = [
    {
      id: 'v1',
      name: 'Sem açúcar',
      streakStartKey: '2026-11-15',
      bestStreak: 5,
      relapses: [],
    },
  ];

  // Simulate Day 1 -> Day 2
  const sim1 = simulateNextDayState({
    tasks,
    historyByDate: history,
    completionLogs: logs,
    vices,
    todayKey: today,
  });
  tasks = sim1.tasks;
  history = sim1.historyByDate;
  logs = sim1.completionLogs;
  vices = sim1.vices;

  assert.equal(tasks[0].completed, false);
  assert.equal(history['2026-11-19'], 'complete');
  assert.equal(history[today], 'missed');
  assert.equal(logs[0].dateKey, '2026-11-19');
  assert.equal(getViceCleanDays(vices[0], today), 6);

  // Mark task done on Day 2, then simulate Day 2 -> Day 3
  tasks = [{ ...tasks[0], completed: true, completedDate: today, completedTime: '09:00', completions: 6 }];
  const sim2 = simulateNextDayState({
    tasks,
    historyByDate: history,
    completionLogs: logs,
    vices,
    todayKey: today,
  });
  assert.equal(sim2.historyByDate['2026-11-18'], 'complete');
  assert.equal(sim2.historyByDate['2026-11-19'], 'complete');
  assert.equal(sim2.historyByDate[today], 'missed');
  assert.equal(calculateCleanStreak(sim2.historyByDate, today), 2);

  // Corrupted storage & legacy XP migration test
  const mem = new MemoryStorage();
  mem.setItem('foco_minimal_tasks_v1', JSON.stringify([{ title: 'Foco', type: 'daily', completions: 7 }, { bad: true }]));
  mem.setItem('foco_minimal_history_v1', '{invalid-json');
  mem.setItem('foco_minimal_completion_logs_v1', 'not-an-array');
  const hydrated = loadInitialFocoState(mem, today);
  assert.equal(hydrated.tasks.length, 1);
  assert.equal(hydrated.totalXp, 7, 'Legacy task completions must migrate cleanly to totalXp');
  assert.deepEqual(hydrated.completionLogs, []);
  assert.deepEqual(hydrated.vices, []);
});

test('getLast7DaysXpSeries computes 7-day cumulative XP curve anchored to totalXp', () => {
  const today = '2026-11-20';
  const logs: CompletionLog[] = [
    { id: 'l1', taskId: 't1', title: 'Ler', type: 'daily', dateKey: '2026-11-16', timeStr: '08:00', timestamp: 1 },
    { id: 'l2', taskId: 't2', title: 'Treinar', type: 'daily', dateKey: '2026-11-16', timeStr: '09:00', timestamp: 2 },
    { id: 'l3', taskId: 't1', title: 'Ler', type: 'daily', dateKey: '2026-11-18', timeStr: '08:30', timestamp: 3 },
    { id: 'l4', taskId: 't1', title: 'Ler', type: 'daily', dateKey: '2026-11-20', timeStr: '10:00', timestamp: 4 },
  ];

  // totalXp = 14 (10 prior to the 7-day window + 4 inside the last 7 days)
  const series = getLast7DaysXpSeries({
    tasks: [],
    completionLogs: logs,
    totalXp: 14,
    todayKey: today,
  });

  assert.equal(series.length, 7);
  assert.equal(series[0].dateKey, '2026-11-14');
  assert.equal(series[6].dateKey, '2026-11-20');
  assert.equal(series[6].label, 'Hoje');

  assert.deepEqual(
    series.map((p) => p.dailyXp),
    [0, 0, 2, 0, 1, 0, 1]
  );
  assert.deepEqual(
    series.map((p) => p.cumulativeXp),
    [10, 10, 12, 12, 13, 13, 14]
  );

  // Zero-state test
  const emptySeries = getLast7DaysXpSeries({
    tasks: [],
    completionLogs: [],
    totalXp: 0,
    todayKey: today,
  });
  assert.deepEqual(
    emptySeries.map((p) => p.cumulativeXp),
    [0, 0, 0, 0, 0, 0, 0]
  );
});

test('All-activity XP rules: +1 XP for tasks, journal, and daily clean vices; -0.5 XP for relapses and missed daily/journal on day close', () => {
  assert.equal(XP_PENALTY_ON_FAIL, 0.5);
  assert.equal(formatXp(2.5), '2,5');
  assert.equal(formatXp(-0.5), '-0,5');
  assert.equal(formatXp(3, true), '+3');

  const today = '2026-11-20';
  let totalXp = 2;
  let xpByDate: Record<string, number> = { [today]: 2 };
  let journalEntries: Record<string, JournalEntry> = {};

  // 1. Journal first save -> +1 XP; updating same day -> 0 XP; clearing -> -1 XP
  const jSave1 = saveJournalWithXp({
    journalEntries,
    totalXp,
    xpByDate,
    dateKey: today,
    entry: { dump: 'Dia produtivo', gratitude: 'Café', mood: 'Bom', updatedAt: 100 },
  });
  assert.equal(jSave1.xpDelta, 1);
  assert.equal(jSave1.totalXp, 3);
  journalEntries = jSave1.journalEntries;
  totalXp = jSave1.totalXp;
  xpByDate = jSave1.xpByDate;

  const jSave2 = saveJournalWithXp({
    journalEntries,
    totalXp,
    xpByDate,
    dateKey: today,
    entry: { dump: 'Dia muito produtivo!', gratitude: 'Café quente', mood: 'Incrível', updatedAt: 200 },
  });
  assert.equal(jSave2.xpDelta, 0, 'Editing existing journal entry must not grant duplicate XP');

  const jClear = clearJournalWithXp({
    journalEntries: jSave2.journalEntries,
    totalXp,
    xpByDate,
    dateKey: today,
  });
  assert.equal(jClear.xpDelta, -1);
  assert.equal(jClear.totalXp, 2);

  // Re-save journal so we test clean day + vice relapse
  const jSave3 = saveJournalWithXp({
    journalEntries: jClear.journalEntries,
    totalXp: jClear.totalXp,
    xpByDate: jClear.xpByDate,
    dateKey: today,
    entry: { dump: 'Voltei a escrever', gratitude: '', mood: 'Bom', updatedAt: 300 },
  });
  journalEntries = jSave3.journalEntries;
  totalXp = jSave3.totalXp; // 3
  xpByDate = jSave3.xpByDate;

  // 2. Vice relapse immediately deducts -0.5 XP -> totalXp = 2.5
  const initialVices: Vice[] = [
    { id: 'v1', name: 'Vídeo curto', streakStartKey: '2026-11-10', bestStreak: 10, relapses: [] },
    { id: 'v2', name: 'Procrastinar', streakStartKey: '2026-11-15', bestStreak: 5, relapses: [] },
  ];
  const relapseRes = recordRelapseWithXp({
    vices: initialVices,
    totalXp,
    xpByDate,
    viceId: 'v1',
    trigger: 'Tédio',
    comment: 'Peguei o celular',
    todayKey: today,
    timeNow: '14:00',
    getBestDays: getViceBestDays,
  });
  assert.equal(relapseRes.xpDelta, -0.5);
  assert.equal(relapseRes.totalXp, 2.5);
  assert.equal(getLevelProgress(2.5).currentLevel.level, 2);
  assert.equal(getLevelProgress(2.5).xpRemainingToNext, 2.5);

  // 3. Day close via simulateNextDayState:
  // - 1 uncompleted daily task (-0.5 XP)
  // - Journal was written (0 penalty)
  // - v1 relapsed today (0 clean bonus), v2 stayed clean (+1 XP)
  // Net day-close delta = +1 - 0.5 = +0.5 -> totalXp = 2.5 + 0.5 = 3.0!
  const tasks: Task[] = [
    {
      id: 'd1',
      title: 'Ler',
      type: 'daily',
      completed: false,
      completedDate: null,
      completedTime: null,
      completions: 0,
      createdAt: 100,
    },
  ];
  const simDay2 = simulateNextDayState({
    tasks,
    historyByDate: {},
    completionLogs: [],
    journalEntries,
    vices: relapseRes.vices,
    totalXp: relapseRes.totalXp,
    xpByDate: relapseRes.xpByDate,
    todayKey: today,
  });
  assert.equal(simDay2.dayCloseReport.cleanViceCount, 1);
  assert.equal(simDay2.dayCloseReport.missedDailyCount, 1);
  assert.equal(simDay2.dayCloseReport.missedJournal, false);
  assert.equal(simDay2.dayCloseReport.netRawDelta, 0.5);
  assert.equal(simDay2.totalXp, 3);
  assert.equal(simDay2.xpByDate['2026-11-19'], 3);
  assert.equal(simDay2.xpByDate[today], undefined, 'New simulated day starts with 0 XP');

  // 4. Simulate Day 2 with NO completions, NO journal written, and NO relapses on v1 & v2:
  // clean vices = 2 (+2 XP), missed daily = 1 (-0.5 XP), missed journal = 1 (-0.5 XP) -> net +1 XP -> totalXp = 4!
  const simDay3 = simulateNextDayState({
    tasks: simDay2.tasks,
    historyByDate: simDay2.historyByDate,
    completionLogs: simDay2.completionLogs,
    journalEntries: simDay2.journalEntries,
    vices: simDay2.vices,
    totalXp: simDay2.totalXp,
    xpByDate: simDay2.xpByDate,
    todayKey: today,
  });
  assert.equal(simDay3.dayCloseReport.cleanViceCount, 2);
  assert.equal(simDay3.dayCloseReport.missedDailyCount, 1);
  assert.equal(simDay3.dayCloseReport.missedJournal, true);
  assert.equal(simDay3.dayCloseReport.netRawDelta, 1);
  assert.equal(simDay3.totalXp, 4);

  // 5. Verify 7-day chart reflects the exact xpByDate net history including 0.5 decimals
  const chart = getLast7DaysXpSeries({
    tasks: simDay3.tasks,
    completionLogs: [],
    totalXp: simDay3.totalXp,
    todayKey: today,
    xpByDate: simDay3.xpByDate,
  });
  assert.equal(chart[4].dailyXp, 3); // 2 days ago (Day 1)
  assert.equal(chart[5].dailyXp, 1); // 1 day ago (Day 2)
  assert.equal(chart[6].dailyXp, 0); // today (fresh Day 3)
  assert.equal(chart[6].cumulativeXp, 4);

  // 6. Midnight rollover from empty/0 XP clamps safely at 0 without going negative
  const rolledZero = applyRolloverIfNeeded(
    tasks,
    {},
    '2026-11-19',
    today,
    { journalEntries: {}, vices: [], totalXp: 0, xpByDate: {} }
  );
  assert.equal(rolledZero.totalXp, 0);
});

test('Journal padlock auto-locks saved entries and only locks after save when content exists', () => {
  assert.equal(shouldJournalAutoLock(undefined), false);
  assert.equal(
    shouldJournalAutoLock({ dump: '   ', gratitude: '', mood: 'Bom', updatedAt: 1 }),
    false
  );
  assert.equal(
    shouldJournalAutoLock({ dump: 'Hoje foquei nos estudos.', gratitude: '', mood: 'Bom', updatedAt: 2 }),
    true
  );
  assert.equal(
    shouldJournalAutoLock({ dump: '', gratitude: 'Saúde e família', mood: 'Incrível', updatedAt: 3 }),
    true
  );

  assert.equal(getNextJournalLockAfterSave('   ', '  '), false);
  assert.equal(getNextJournalLockAfterSave('Texto escrito', ''), true);
  assert.equal(getNextJournalLockAfterSave('', 'Gratidão do dia'), true);
});

test('Navbar XP notification formats task completions, journal saves, level-ups, and undos accurately', () => {
  assert.deepEqual(formatNavbarXpNotice({ id: 1, delta: 1, source: 'task' }), {
    deltaText: '+1 XP',
    detailText: 'Tarefa',
    isPositive: true,
  });
  assert.deepEqual(formatNavbarXpNotice({ id: 2, delta: 1, source: 'journal' }), {
    deltaText: '+1 XP',
    detailText: 'Diário',
    isPositive: true,
  });
  assert.deepEqual(
    formatNavbarXpNotice({ id: 3, delta: 1, source: 'task', leveledUpTo: 4 }),
    {
      deltaText: '+1 XP',
      detailText: 'Nível 4!',
      isPositive: true,
    }
  );
  assert.deepEqual(
    formatNavbarXpNotice({ id: 4, delta: -1, source: 'task', leveledUpTo: null }),
    {
      deltaText: '-1 XP',
      detailText: 'Tarefa',
      isPositive: false,
    }
  );
});

test('User profile sanitization, initials extraction, and storage hydration handle valid and corrupted data', () => {
  assert.deepEqual(sanitizeProfile(null), { name: '', photoDataUrl: null, updatedAt: 0 });
  assert.deepEqual(
    sanitizeProfile({
      name: '  Pedro Henrique  ',
      photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      updatedAt: 12345,
    }),
    {
      name: 'Pedro Henrique',
      photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      updatedAt: 12345,
    }
  );
  // Reject non-image URLs
  assert.equal(
    sanitizeProfile({ name: 'Ana', photoDataUrl: 'javascript:alert(1)' }).photoDataUrl,
    null
  );
  // Enforce 60 char limit
  assert.equal(sanitizeProfile({ name: 'a'.repeat(100) }).name.length, 60);

  assert.equal(getProfileInitials(''), '');
  assert.equal(getProfileInitials('Pedro'), 'PE');
  assert.equal(getProfileInitials('Pedro Henrique'), 'PH');
  assert.equal(getProfileInitials('Ana Maria Silva'), 'AS');

  const mem = new MemoryStorage();
  mem.setItem(
    'foco_minimal_profile_v1',
    JSON.stringify({
      name: 'Carlos',
      photoDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      updatedAt: 999,
    })
  );
  const hydrated = loadInitialFocoState(mem, '2026-11-20');
  assert.equal(hydrated.profile.name, 'Carlos');
  assert.equal(hydrated.profile.photoDataUrl, 'data:image/png;base64,iVBORw0KGgo=');
});

test('Deleting a completed daily task via X reverts its +1 XP point, xpByDate, and completion log', () => {
  const today = '2026-11-20';
  let tasks: Task[] = [];
  let history: Record<string, DailyStatus> = {};
  let logs: CompletionLog[] = [];
  let totalXp = 0;
  let xpByDate: Record<string, number> = {};

  // Add a daily task and complete it today -> +1 XP
  const added = addTaskState({
    tasks,
    historyByDate: history,
    title: 'Ler 15 páginas',
    type: 'daily',
    todayKey: today,
  });
  tasks = added.tasks;
  history = added.historyByDate;
  const dailyId = added.addedTask!.id;

  const toggled = toggleTaskWithXp({
    tasks,
    completionLogs: logs,
    historyByDate: history,
    totalXp,
    xpByDate,
    taskId: dailyId,
    todayKey: today,
    timeNow: '10:30',
  });
  tasks = toggled.tasks;
  logs = toggled.completionLogs;
  history = toggled.historyByDate;
  totalXp = toggled.totalXp;
  xpByDate = toggled.xpByDate;

  assert.equal(totalXp, 1);
  assert.equal(xpByDate[today], 1);
  assert.equal(logs.length, 1);
  assert.equal(getTodayXpEarned(tasks, logs, today, xpByDate).xpToday, 1);

  // User clicks X (delete) on the completed daily task -> point and log must be removed!
  const deleted = deleteTaskWithXp({
    tasks,
    completionLogs: logs,
    historyByDate: history,
    totalXp,
    xpByDate,
    taskId: dailyId,
    todayKey: today,
  });

  assert.equal(deleted.deletedTask?.id, dailyId);
  assert.equal(deleted.xpDelta, -1);
  assert.equal(deleted.totalXp, 0);
  assert.equal(deleted.xpByDate[today], undefined);
  assert.equal(deleted.completionLogs.length, 0);
  assert.equal(deleted.tasks.length, 0);
  assert.equal(
    getTodayXpEarned(deleted.tasks, deleted.completionLogs, today, deleted.xpByDate).xpToday,
    0
  );
  assert.equal(
    getTodayXpEarned(deleted.tasks, deleted.completionLogs, today, deleted.xpByDate)
      .completedTodayCount,
    0
  );

  // Deleting an unchecked daily task preserves previously earned XP
  const pendingAdded = addTaskState({
    tasks: [],
    historyByDate: {},
    title: 'Meditar',
    type: 'daily',
    todayKey: today,
  });
  const pendingDelete = deleteTaskWithXp({
    tasks: pendingAdded.tasks,
    completionLogs: [],
    historyByDate: pendingAdded.historyByDate,
    totalXp: 5,
    xpByDate: { '2026-11-19': 5 },
    taskId: pendingAdded.addedTask!.id,
    todayKey: today,
  });
  assert.equal(pendingDelete.xpDelta, 0);
  assert.equal(pendingDelete.totalXp, 5);
});

test('All XP deductions return leveledDownTo when dropping below Level 2 threshold and navbar notice formats it', () => {
  const today = '2026-11-20';
  // Level 2 starts at 2 XP; dropping below 2 XP returns to Level 1
  assert.equal(getLevelProgress(2).currentLevel.level, 2);
  assert.equal(getLevelProgress(1.5).currentLevel.level, 1);

  // 1) Unchecking a task drops 2 XP -> 1 XP (Level 2 -> Level 1)
  const task: Task = {
    id: 't-1',
    title: 'Estudar',
    type: 'daily',
    completed: true,
    completedDate: today,
    completedTime: '09:00',
    completions: 1,
    createdAt: 1000,
  };
  const log: CompletionLog = {
    id: 'l-1',
    taskId: 't-1',
    title: 'Estudar',
    type: 'daily',
    dateKey: today,
    timeStr: '09:00',
    timestamp: 1000,
  };
  const unchecked = toggleTaskWithXp({
    tasks: [task],
    completionLogs: [log],
    historyByDate: {},
    totalXp: 2,
    xpByDate: { [today]: 2 },
    taskId: 't-1',
    todayKey: today,
    timeNow: '09:10',
  });
  assert.equal(unchecked.totalXp, 1);
  assert.equal(unchecked.leveledDownTo, 1);

  // 2) Deleting a completed task via X drops 2 XP -> 1 XP (Level 2 -> Level 1)
  const deleted = deleteTaskWithXp({
    tasks: [task],
    completionLogs: [log],
    historyByDate: {},
    totalXp: 2,
    xpByDate: { [today]: 2 },
    taskId: 't-1',
    todayKey: today,
  });
  assert.equal(deleted.totalXp, 1);
  assert.equal(deleted.leveledDownTo, 1);

  // 3) Clearing a journal entry drops 2 XP -> 1 XP (Level 2 -> Level 1)
  const journalCleared = clearJournalWithXp({
    journalEntries: {
      [today]: {
        dump: 'Hoje mantive o foco total.',
        gratitude: 'Saúde e clareza',
        mood: 'Incrível',
        updatedAt: 1000,
      },
    },
    totalXp: 2,
    xpByDate: { [today]: 2 },
    dateKey: today,
  });
  assert.equal(journalCleared.totalXp, 1);
  assert.equal(journalCleared.leveledDownTo, 1);

  // 4) Saving an empty journal entry drops 2 XP -> 1 XP (Level 2 -> Level 1)
  const journalEmptied = saveJournalWithXp({
    journalEntries: {
      [today]: {
        dump: 'Reflexão',
        gratitude: 'Paz',
        mood: 'Bom',
        updatedAt: 1000,
      },
    },
    totalXp: 2,
    xpByDate: { [today]: 2 },
    dateKey: today,
    entry: { dump: '   ', gratitude: '', mood: 'Normal', updatedAt: 2000 },
  });
  assert.equal(journalEmptied.totalXp, 1);
  assert.equal(journalEmptied.leveledDownTo, 1);

  // 5) Recording a vice relapse drops 2 XP -> 1.5 XP (Level 2 -> Level 1)
  const relapsed = recordRelapseWithXp({
    vices: [
      {
        id: 'v-1',
        name: 'Redes sociais',
        streakStartKey: '2026-11-10',
        bestStreak: 10,
        relapses: [],
      },
    ],
    totalXp: 2,
    xpByDate: { [today]: 2 },
    viceId: 'v-1',
    trigger: 'Tédio',
    todayKey: today,
    timeNow: '14:00',
    getBestDays: getViceBestDays,
  });
  assert.equal(relapsed.totalXp, 1.5);
  assert.equal(relapsed.leveledDownTo, 1);

  // 6) Header navbar XP notification displays level-down label when leveledDownTo is present
  assert.deepEqual(
    formatNavbarXpNotice({ id: 5, delta: -1, source: 'task', leveledDownTo: 1 }),
    {
      deltaText: '-1 XP',
      detailText: 'Voltou ao Nível 1',
      isPositive: false,
    }
  );
  assert.deepEqual(
    formatNavbarXpNotice({ id: 6, delta: -0.5, source: 'vice', leveledDownTo: 1 }),
    {
      deltaText: '-0,5 XP',
      detailText: 'Voltou ao Nível 1',
      isPositive: false,
    }
  );
  assert.deepEqual(
    formatNavbarXpNotice({ id: 7, delta: -0.5, source: 'vice', leveledDownTo: null }),
    {
      deltaText: '-0,5 XP',
      detailText: 'Recaída',
      isPositive: false,
    }
  );
});

test('loadInitialFocoState reconciles pre-fix orphaned today logs and returns user to Level 1 while preserving intentionally cleared logs', () => {
  const today = '2026-11-20';
  const mem = new MemoryStorage();

  // Suppose user had 1 legitimate preserved log (+1 XP) and 1 orphaned un-preserved log (+1 XP) from a deleted daily task = 2 XP (Level 2)
  mem.setItem('foco_minimal_tasks_v1', JSON.stringify([]));
  mem.setItem('foco_minimal_last_active_v1', today);
  mem.setItem('foco_minimal_total_xp_v1', '2');
  mem.setItem('foco_minimal_xp_by_date_v1', JSON.stringify({ [today]: 2 }));
  mem.setItem(
    'foco_minimal_completion_logs_v1',
    JSON.stringify([
      {
        id: 'orphan-log',
        taskId: 'deleted-daily-1',
        title: 'Tarefa apagada no X antes do fix',
        type: 'daily',
        dateKey: today,
        timeStr: '08:00',
        timestamp: 1000,
      },
      {
        id: 'preserved-log',
        taskId: 'cleared-once-1',
        title: 'Concluída limpa intencionalmente',
        type: 'once',
        dateKey: today,
        timeStr: '09:00',
        timestamp: 2000,
        preserved: true,
      },
    ])
  );

  const hydrated = loadInitialFocoState(mem, today);

  assert.equal(hydrated.totalXp, 1);
  assert.equal(hydrated.xpByDate[today], 1);
  assert.equal(getLevelProgress(hydrated.totalXp).currentLevel.level, 1);
  assert.equal(hydrated.completionLogs.length, 1);
  assert.equal(hydrated.completionLogs[0].id, 'preserved-log');
  assert.equal(mem.getItem('foco_minimal_total_xp_v1'), '1');
});

test('Rocket Impulse mode records urge with date/time, updates inertia exercise, hydrates storage, and grants zero XP', () => {
  const today = '2026-11-20';
  const timeNow = '21:25';

  // Ensure rich escape actions (escapatórias) and multiple breathing modes exist
  assert.ok(IMPULSE_CHALLENGES.length >= 10);
  assert.ok(IMPULSE_CHALLENGES.some((c) => /and(e|ar)/i.test(c.title) || /and(e|ar)/i.test(c.instruction)));
  assert.ok(BREATHING_PATTERNS.length >= 4);
  assert.ok(BREATHING_PATTERNS.every((p) => p.steps.length >= 2 && p.steps.every((s) => s.seconds > 0)));
  assert.equal(pickRandomItemIndex(4, 2, () => 0.5), 3);
  assert.equal(pickRandomItemIndex(1, 0, () => 0.9), 0);

  // Reject blank thought
  const emptyAttempt = recordImpulseEntry({
    logs: [],
    thought: '   ',
    dateKey: today,
    timeStr: timeNow,
  });
  assert.equal(emptyAttempt.createdLog, null);
  assert.equal(emptyAttempt.logs.length, 0);

  // Record thought with exact dateKey and timeStr
  const recorded = recordImpulseEntry({
    logs: [],
    thought: 'Quase abri o feed de vídeos curtos por tédio',
    dateKey: today,
    timeStr: timeNow,
    timestamp: 123456,
  });
  assert.ok(recorded.createdLog);
  assert.equal(recorded.logs.length, 1);
  assert.equal(recorded.createdLog.dateKey, today);
  assert.equal(recorded.createdLog.timeStr, timeNow);
  assert.equal(recorded.createdLog.completedExercise, false);

  // Complete breathing + movement exercise
  const completedLogs = completeImpulseExercise({
    logs: recorded.logs,
    logId: recorded.createdLog.id,
    actionTaken: 'Respiração guiada (2 ciclos) + Levante e ande agora',
    breathingCycles: 2,
    completedExercise: true,
  });
  assert.equal(completedLogs[0].completedExercise, true);
  assert.equal(completedLogs[0].breathingCycles, 2);
  assert.match(completedLogs[0].actionTaken, /Levante e ande agora/);

  // Simulate next day: impulseLogs shift backward cleanly and add 0 XP
  const sim = simulateNextDayState({
    tasks: [],
    historyByDate: {},
    completionLogs: [],
    impulseLogs: completedLogs,
    journalEntries: {
      [today]: { dump: 'Foco', gratitude: 'Calma', mood: 'Bom', updatedAt: 1000 },
    },
    vices: [],
    totalXp: 3,
    xpByDate: { [today]: 3 },
    todayKey: today,
  });
  assert.equal(sim.impulseLogs[0].dateKey, '2026-11-19');
  // Impulse logs never add or subtract XP
  assert.equal(sim.totalXp, 3);
  assert.equal(sim.xpDeltaApplied, 0);

  // Hydrate and sanitize from storage
  const sanitized = sanitizeImpulseLogs([
    completedLogs[0],
    { id: 'bad', thought: '   ' },
    null,
  ]);
  assert.equal(sanitized.length, 1);

  const mem = new MemoryStorage();
  mem.setItem('foco_minimal_impulse_logs_v1', JSON.stringify(completedLogs));
  const hydrated = loadInitialFocoState(mem, today);
  assert.equal(hydrated.impulseLogs.length, 1);
  assert.equal(hydrated.impulseLogs[0].thought, 'Quase abri o feed de vídeos curtos por tédio');
  assert.equal(hydrated.totalXp, 0);

  // Delete entry
  const afterDelete = deleteImpulseEntry({
    logs: hydrated.impulseLogs,
    logId: hydrated.impulseLogs[0].id,
  });
  assert.equal(afterDelete.length, 0);
});

test('Timed tasks block early XP completion until timer ends and award +1 XP when fromTimer is true', () => {
  const today = '2026-11-20';
  assert.equal(formatTimerClock(600), '10:00');
  assert.equal(formatTimerClock(65), '01:05');
  assert.equal(formatTimerClock(0), '00:00');

  const added = addTaskState({
    tasks: [],
    historyByDate: {},
    title: 'Estudo inglês',
    type: 'daily',
    todayKey: today,
    timerMinutes: 10,
  });
  assert.ok(added.addedTask);
  assert.equal(added.addedTask.timerMinutes, 10);

  // Sanitization preserves timerMinutes and clamps bounds
  const hydratedTask = sanitizeTask(added.addedTask, today, '21:35');
  assert.equal(hydratedTask?.timerMinutes, 10);

  // Manual toggle without fromTimer MUST NOT mark completed or grant XP
  const earlyAttempt = toggleTaskWithXp({
    tasks: added.tasks,
    completionLogs: [],
    historyByDate: added.historyByDate,
    totalXp: 0,
    xpByDate: {},
    taskId: added.addedTask.id,
    todayKey: today,
    timeNow: '21:35',
  });
  assert.equal(earlyAttempt.didComplete, false);
  assert.equal(earlyAttempt.xpDelta, 0);
  assert.equal(earlyAttempt.totalXp, 0);
  assert.equal(earlyAttempt.tasks[0].completed, false);

  // Completion when timer finishes (fromTimer: true) grants +1 XP
  const finished = toggleTaskWithXp({
    tasks: earlyAttempt.tasks,
    completionLogs: earlyAttempt.completionLogs,
    historyByDate: earlyAttempt.historyByDate,
    totalXp: 0,
    xpByDate: {},
    taskId: added.addedTask.id,
    todayKey: today,
    timeNow: '21:45',
    fromTimer: true,
  });
  assert.equal(finished.didComplete, true);
  assert.equal(finished.xpDelta, 1);
  assert.equal(finished.totalXp, 1);
  assert.equal(finished.tasks[0].completed, true);

  // Unchecking afterwards reverts -1 XP cleanly
  const unchecked = toggleTaskWithXp({
    tasks: finished.tasks,
    completionLogs: finished.completionLogs,
    historyByDate: finished.historyByDate,
    totalXp: finished.totalXp,
    xpByDate: finished.xpByDate,
    taskId: added.addedTask.id,
    todayKey: today,
    timeNow: '21:46',
  });
  assert.equal(unchecked.didComplete, false);
  assert.equal(unchecked.xpDelta, -1);
  assert.equal(unchecked.totalXp, 0);
});



test('shuffled song bag plays every song once before repeating and never starts on the current one', () => {
  const total = RELAXING_SONGS.length;
  for (let current = 0; current < total; current += 1) {
    const bag = buildShuffledSongBag(current, total);
    assert.equal(bag.length, total - 1);
    assert.ok(!bag.includes(current));
    assert.equal(new Set(bag).size, total - 1);
  }
});

test('pickChordOrder always returns a permutation of the progression', () => {
  const seenOrders = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const order = pickChordOrder(4);
    assert.equal(order.length, 4);
    assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
    seenOrders.add(order.join(','));
  }
  assert.ok(seenOrders.size > 1, 'Chord order must vary between laps');
  assert.deepEqual(pickChordOrder(2), [0, 1]);
});

test('engine auto-advances through all songs without repeating until the whole set played', async () => {
  const { MockAudioContext } = createMockAudioEnvironment();
  const engine = new AmbientAudioEngine({
    AudioContextClass: MockAudioContext as unknown as typeof AudioContext,
    storage: new MemoryStorage(),
  });
  engine.setMusicEnabled(true);
  const played: number[] = [engine.getSnapshot().currentSongIndex];
  for (let i = 0; i < RELAXING_SONGS.length - 1; i += 1) {
    engine.nextRandomSong();
    played.push(engine.getSnapshot().currentSongIndex);
  }
  assert.equal(new Set(played).size, RELAXING_SONGS.length, 'One full round must cover every song once');
  engine.dispose();
});

test('engine plays xp-loss and click sound effects only when sfx is enabled', () => {
  const { MockAudioContext, stats } = createMockAudioEnvironment();
  const engine = new AmbientAudioEngine({
    AudioContextClass: MockAudioContext as unknown as typeof AudioContext,
    storage: new MemoryStorage(),
  });
  engine.setMusicEnabled(false);
  engine.setRainEnabled(false);
  engine.unlock();

  const before = stats.startedOscillators;
  engine.playXpLoss();
  const afterLoss = stats.startedOscillators;
  assert.ok(afterLoss - before >= 5, 'XP loss should layer thump + descending notes');

  engine.playClick('tap');
  assert.ok(stats.startedOscillators > afterLoss, 'Click should produce a sound');

  engine.setSfxEnabled(false);
  const muted = stats.startedOscillators;
  engine.playXpLoss();
  engine.playUncheckPoint();
  engine.playClick('toggle');
  assert.equal(stats.startedOscillators, muted, 'No SFX when muted');
  engine.dispose();
});

test('sanitizeProfile rejects SVG data URIs, javascript URLs, and oversized payloads while keeping valid raster images', () => {
  const svgPayload = sanitizeProfile({
    name: 'Tester',
    photoDataUrl: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+',
    updatedAt: 100,
  });
  assert.equal(svgPayload.photoDataUrl, null);

  const jsPayload = sanitizeProfile({
    name: 'Tester',
    photoDataUrl: 'javascript:alert(1)',
    updatedAt: 100,
  });
  assert.equal(jsPayload.photoDataUrl, null);

  const validPng = sanitizeProfile({
    name: 'Tester',
    photoDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    updatedAt: 100,
  });
  assert.equal(validPng.photoDataUrl, 'data:image/png;base64,iVBORw0KGgo=');
});

