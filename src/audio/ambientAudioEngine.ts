import {
  RELAXING_SONGS,
  buildShuffledSongBag,
  pickChordOrder,
  pickNextRandomSongIndex,
} from './songs';
import { BACKGROUND_SOUNDSCAPES, pickNextRandomSoundscapeIndex } from './soundscapes';
import {
  STORAGE_KEYS,
  type AudioStatusSnapshot,
  type BackgroundSoundscape,
  type RelaxingSong,
} from '../types/foco';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AmbientAudioEngineOptions {
  AudioContextClass?: typeof AudioContext;
  storage?: StorageLike;
  rng?: () => number;
  createAudioElement?: () => HTMLAudioElement;
  songStepIntervalOverrideMs?: number;
  soundscapeDurationOverrideMs?: number;
}

interface RainNodeGroup {
  generationId: number;
  kind: BackgroundSoundscape['kind'];
  sources: AudioBufferSourceNode[];
  lfos: OscillatorNode[];
  nodes: AudioNode[];
  outputGain: GainNode;
  eventTimers: Set<ReturnType<typeof setTimeout>>;
}

interface ActiveVoice {
  stopAt: number;
  oscillators: OscillatorNode[];
  gainNode: GainNode;
}

interface SongRun {
  /** Fator de transposição (tom diferente a cada execução). */
  ratio: number;
  /** Posição atual da melodia dentro da escala. */
  melodyIdx: number;
  /** Últimas notas tocadas (motivo que pode ser repetido). */
  motif: number[];
  motifPos: number;
  /** Ordem dos acordes da volta atual. */
  chordOrder: number[];
}

function clampVolume(value: number, fallback: number = 0.6): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function getDefaultAudioContextClass(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const win = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return win.AudioContext || win.webkitAudioContext;
}

export class AmbientAudioEngine {
  private readonly audioContextClass?: typeof AudioContext;
  private readonly storage: StorageLike | null;
  private readonly rng: () => number;
  private readonly createAudioElement?: () => HTMLAudioElement;
  private readonly songStepIntervalOverrideMs?: number;
  private readonly soundscapeDurationOverrideMs?: number;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicBusGain: GainNode | null = null;
  private rainBusGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedbackGain: GainNode | null = null;
  private delayWetGain: GainNode | null = null;

  private musicEnabled: boolean;
  private rainEnabled: boolean;
  private sfxEnabled: boolean;
  private musicVolume: number;
  private rainVolume: number;

  private currentSongIndex: number;
  private songBag: number[] = [];
  private lastClickAt = 0;
  private songGenerationId: number = 0;
  private songStepTimer: ReturnType<typeof setTimeout> | null = null;
  private songCleanupTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private activeVoices: Set<ActiveVoice> = new Set();

  private currentSoundscapeIndex: number;
  private rainGenerationId: number = 0;
  private rainNodes: RainNodeGroup | null = null;
  private rainBuffer: AudioBuffer | null = null;
  private rainCleanupTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  private customAudioEl: HTMLAudioElement | null = null;
  private customAudioUrl: string | null = null;
  private customTrackName: string | null = null;

  private isAudioUnlocked: boolean = false;
  private isDisposed: boolean = false;
  private listeners: Set<(snapshot: AudioStatusSnapshot) => void> = new Set();

  constructor(options: AmbientAudioEngineOptions = {}) {
    this.audioContextClass = options.AudioContextClass ?? getDefaultAudioContextClass();
    this.storage = options.storage !== undefined ? options.storage : getDefaultStorage();
    this.rng = options.rng ?? Math.random;
    this.createAudioElement = options.createAudioElement;
    this.songStepIntervalOverrideMs = options.songStepIntervalOverrideMs;
    this.soundscapeDurationOverrideMs = options.soundscapeDurationOverrideMs;

    this.musicEnabled = this.readBool(STORAGE_KEYS.BGM, true);
    this.rainEnabled = this.readBool(STORAGE_KEYS.RAIN, true);
    this.sfxEnabled = this.readBool(STORAGE_KEYS.SFX, true);
    this.musicVolume = this.readNumber(STORAGE_KEYS.BGM_VOL, 0.7);
    this.rainVolume = this.readNumber(STORAGE_KEYS.RAIN_VOL, 0.45);
    this.currentSongIndex = pickNextRandomSongIndex(-1, RELAXING_SONGS.length, this.rng);
    this.currentSoundscapeIndex = pickNextRandomSoundscapeIndex(
      -1,
      BACKGROUND_SOUNDSCAPES.length,
      this.rng
    );
  }

  private readBool(key: string, defaultValue: boolean): boolean {
    try {
      const val = this.storage?.getItem(key);
      if (val === null || val === undefined) return defaultValue;
      return val !== 'false';
    } catch {
      return defaultValue;
    }
  }

  private readNumber(key: string, defaultValue: number): number {
    try {
      const raw = this.storage?.getItem(key);
      if (raw === null || raw === undefined) return defaultValue;
      return clampVolume(Number(raw), defaultValue);
    } catch {
      return defaultValue;
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Ignore storage quota or sandbox restrictions
    }
  }

  public getSnapshot(): AudioStatusSnapshot {
    const song = RELAXING_SONGS[this.currentSongIndex] ?? RELAXING_SONGS[0];
    const soundscape =
      BACKGROUND_SOUNDSCAPES[this.currentSoundscapeIndex] ?? BACKGROUND_SOUNDSCAPES[0];
    const hasCustomPlaying = Boolean(
      this.customAudioEl && this.customTrackName && this.musicEnabled && !this.customAudioEl.paused
    );
    const hasSynthPlaying = Boolean(
      this.musicEnabled && !this.customTrackName && this.songStepTimer !== null && this.isAudioUnlocked
    );
    const hasRainPlaying = Boolean(
      this.rainEnabled && this.rainNodes !== null && this.isAudioUnlocked
    );

    return {
      musicEnabled: this.musicEnabled,
      rainEnabled: this.rainEnabled,
      sfxEnabled: this.sfxEnabled,
      musicVolume: this.musicVolume,
      rainVolume: this.rainVolume,
      currentSongIndex: this.currentSongIndex,
      currentSong: song,
      currentSoundscapeIndex: this.currentSoundscapeIndex,
      currentSoundscape: soundscape,
      customTrackName: this.customTrackName,
      isAudioUnlocked: this.isAudioUnlocked,
      isPlayingMusic: hasCustomPlaying || hasSynthPlaying,
      isPlayingRain: hasRainPlaying,
    };
  }

  public subscribe(listener: (snapshot: AudioStatusSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snap));
  }

  private ensureContext(shouldResume: boolean): AudioContext | null {
    if (this.isDisposed || !this.audioContextClass) return null;

    if (!this.ctx) {
      this.ctx = new this.audioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.92, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.musicBusGain = this.ctx.createGain();
      this.musicBusGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
      this.musicBusGain.connect(this.masterGain);

      this.rainBusGain = this.ctx.createGain();
      this.rainBusGain.gain.setValueAtTime(this.rainVolume, this.ctx.currentTime);
      this.rainBusGain.connect(this.masterGain);

      if (typeof this.ctx.createDelay === 'function') {
        this.delayNode = this.ctx.createDelay(1.0);
        this.delayNode.delayTime.setValueAtTime(0.38, this.ctx.currentTime);
        this.delayFeedbackGain = this.ctx.createGain();
        this.delayFeedbackGain.gain.setValueAtTime(0.32, this.ctx.currentTime);
        this.delayWetGain = this.ctx.createGain();
        this.delayWetGain.gain.setValueAtTime(0.28, this.ctx.currentTime);

        this.delayNode.connect(this.delayFeedbackGain);
        this.delayFeedbackGain.connect(this.delayNode);
        this.delayNode.connect(this.delayWetGain);
        this.delayWetGain.connect(this.musicBusGain);
      }

      if (this.ctx.state === 'running') {
        this.isAudioUnlocked = true;
      }
    }

    if (shouldResume && this.ctx.state === 'suspended') {
      this.ctx
        .resume()
        .then(() => {
          if (this.isDisposed) return;
          this.isAudioUnlocked = true;
          this.syncPlaybackAfterUnlock();
          this.emit();
        })
        .catch(() => {
          // Will unlock on next user gesture
        });
    } else if (this.ctx.state === 'running') {
      this.isAudioUnlocked = true;
    }

    return this.ctx;
  }

  private syncPlaybackAfterUnlock(): void {
    if (this.isDisposed) return;
    if (this.rainEnabled && !this.rainNodes) {
      this.startRain();
    }
    if (this.musicEnabled && !this.customTrackName && this.songStepTimer === null) {
      this.startSynthLoop();
    }
  }

  public unlock(): void {
    if (this.isDisposed) return;
    const ctx = this.ensureContext(true);
    if (ctx && ctx.state === 'running') {
      this.isAudioUnlocked = true;
      this.syncPlaybackAfterUnlock();
    }
    if (this.musicEnabled && this.customTrackName && this.customAudioEl) {
      this.customAudioEl.volume = this.musicVolume;
      this.customAudioEl.play().catch(() => {});
    }
    this.emit();
  }

  public startIfEnabled(): void {
    if (this.isDisposed) return;
    const ctx = this.ensureContext(true);
    if (!ctx) {
      this.emit();
      return;
    }

    if (ctx.state === 'running') {
      this.isAudioUnlocked = true;
      if (this.rainEnabled) {
        this.startRain();
      }
      if (this.musicEnabled) {
        this.startMusic();
      }
    }
    this.emit();
  }

  public setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = Boolean(enabled);
    this.writeStorage(STORAGE_KEYS.BGM, String(this.musicEnabled));

    if (this.musicEnabled) {
      this.unlock();
      this.startMusic();
    } else {
      this.stopMusic();
    }
    this.emit();
  }

  public toggleMusic(): boolean {
    this.setMusicEnabled(!this.musicEnabled);
    return this.musicEnabled;
  }

  public setRainEnabled(enabled: boolean): void {
    this.rainEnabled = Boolean(enabled);
    this.writeStorage(STORAGE_KEYS.RAIN, String(this.rainEnabled));

    if (this.rainEnabled) {
      this.unlock();
      this.startRain();
    } else {
      this.stopRain();
    }
    this.emit();
  }

  public toggleRain(): boolean {
    this.setRainEnabled(!this.rainEnabled);
    return this.rainEnabled;
  }

  public setSfxEnabled(enabled: boolean): void {
    this.sfxEnabled = Boolean(enabled);
    this.writeStorage(STORAGE_KEYS.SFX, String(this.sfxEnabled));
    this.emit();
  }

  public setMusicVolume(volume: number): void {
    this.musicVolume = clampVolume(volume, 0.7);
    this.writeStorage(STORAGE_KEYS.BGM_VOL, String(this.musicVolume));

    if (this.ctx && this.musicBusGain) {
      this.musicBusGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.04);
    }
    if (this.customAudioEl) {
      this.customAudioEl.volume = this.musicVolume;
    }
    this.emit();
  }

  public setRainVolume(volume: number): void {
    this.rainVolume = clampVolume(volume, 0.45);
    this.writeStorage(STORAGE_KEYS.RAIN_VOL, String(this.rainVolume));

    if (this.ctx && this.rainBusGain) {
      this.rainBusGain.gain.setTargetAtTime(this.rainVolume, this.ctx.currentTime, 0.05);
    }
    this.emit();
  }

  /** Sorteia a próxima música sem repetir nenhuma até todas tocarem. */
  private drawNextSongIndex(): number {
    const total = RELAXING_SONGS.length;
    if (total <= 1) return 0;
    this.songBag = this.songBag.filter(
      (i) => i !== this.currentSongIndex && i >= 0 && i < total
    );
    if (this.songBag.length === 0) {
      this.songBag = buildShuffledSongBag(this.currentSongIndex, total, this.rng);
    }
    return this.songBag.pop() ?? pickNextRandomSongIndex(this.currentSongIndex, total, this.rng);
  }

  private randInt(min: number, max: number): number {
    const raw = this.rng();
    const r = Number.isFinite(raw) ? Math.min(0.9999999, Math.max(0, raw)) : 0;
    return min + Math.floor(r * (max - min + 1));
  }

  private rand(): number {
    const raw = this.rng();
    return Number.isFinite(raw) ? Math.min(0.9999999, Math.max(0, raw)) : 0;
  }

  public nextRandomSong(): RelaxingSong {
    this.currentSongIndex = this.drawNextSongIndex();

    if (this.customTrackName) {
      this.clearCustomAudioInternal(false);
    }

    if (this.musicEnabled) {
      this.unlock();
      this.stopSynthLoop(true);
      this.startSynthLoop();
    }

    this.emit();
    return RELAXING_SONGS[this.currentSongIndex];
  }

  public selectSong(index: number): RelaxingSong {
    const safeIndex =
      Number.isInteger(index) && index >= 0 && index < RELAXING_SONGS.length ? index : 0;
    this.currentSongIndex = safeIndex;

    if (this.customTrackName) {
      this.clearCustomAudioInternal(false);
    }

    if (!this.musicEnabled) {
      this.musicEnabled = true;
      this.writeStorage(STORAGE_KEYS.BGM, 'true');
    }

    this.unlock();
    this.stopSynthLoop(true);
    this.startSynthLoop();
    this.emit();
    return RELAXING_SONGS[this.currentSongIndex];
  }

  public nextRandomSoundscape(): BackgroundSoundscape {
    this.currentSoundscapeIndex = pickNextRandomSoundscapeIndex(
      this.currentSoundscapeIndex,
      BACKGROUND_SOUNDSCAPES.length,
      this.rng
    );

    if (!this.rainEnabled) {
      this.rainEnabled = true;
      this.writeStorage(STORAGE_KEYS.RAIN, 'true');
    }

    this.unlock();
    this.stopRain();
    this.startRain();
    this.emit();
    return BACKGROUND_SOUNDSCAPES[this.currentSoundscapeIndex];
  }

  public selectSoundscape(index: number): BackgroundSoundscape {
    const safeIndex =
      Number.isInteger(index) && index >= 0 && index < BACKGROUND_SOUNDSCAPES.length ? index : 0;
    this.currentSoundscapeIndex = safeIndex;

    if (!this.rainEnabled) {
      this.rainEnabled = true;
      this.writeStorage(STORAGE_KEYS.RAIN, 'true');
    }

    this.unlock();
    this.stopRain();
    this.startRain();
    this.emit();
    return BACKGROUND_SOUNDSCAPES[this.currentSoundscapeIndex];
  }

  public randomizeAll(): { song: RelaxingSong; soundscape: BackgroundSoundscape } {
    this.currentSongIndex = pickNextRandomSongIndex(
      this.currentSongIndex,
      RELAXING_SONGS.length,
      this.rng
    );
    this.currentSoundscapeIndex = pickNextRandomSoundscapeIndex(
      this.currentSoundscapeIndex,
      BACKGROUND_SOUNDSCAPES.length,
      this.rng
    );

    if (this.customTrackName) {
      this.clearCustomAudioInternal(false);
    }

    this.musicEnabled = true;
    this.rainEnabled = true;
    this.writeStorage(STORAGE_KEYS.BGM, 'true');
    this.writeStorage(STORAGE_KEYS.RAIN, 'true');

    this.unlock();
    this.stopSynthLoop(true);
    this.startSynthLoop();
    this.stopRain();
    this.startRain();
    this.emit();

    return {
      song: RELAXING_SONGS[this.currentSongIndex],
      soundscape: BACKGROUND_SOUNDSCAPES[this.currentSoundscapeIndex],
    };
  }

  public setCustomAudioFile(file: File): void {
    if (!file || this.isDisposed) return;

    this.stopSynthLoop(true);

    if (this.customAudioUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      URL.revokeObjectURL(this.customAudioUrl);
    }

    if (
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function' &&
      typeof Blob !== 'undefined' &&
      file instanceof Blob
    ) {
      this.customAudioUrl = URL.createObjectURL(file);
    } else {
      this.customAudioUrl = '';
    }

    if (!this.customAudioEl) {
      this.customAudioEl = this.createAudioElement
        ? this.createAudioElement()
        : new Audio();
      this.customAudioEl.loop = true;
    }

    this.customAudioEl.src = this.customAudioUrl;
    this.customAudioEl.volume = this.musicVolume;
    this.customTrackName = file.name.replace(/\.[^/.]+$/, '') || file.name;

    this.musicEnabled = true;
    this.writeStorage(STORAGE_KEYS.BGM, 'true');

    this.customAudioEl.play().catch(() => {});
    this.emit();
  }

  public clearCustomAudioFile(): void {
    this.clearCustomAudioInternal(true);
  }

  private clearCustomAudioInternal(restartSynthIfEnabled: boolean): void {
    if (this.customAudioEl) {
      this.customAudioEl.pause();
      this.customAudioEl.removeAttribute('src');
      this.customAudioEl.load?.();
    }
    if (this.customAudioUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      URL.revokeObjectURL(this.customAudioUrl);
    }
    this.customAudioUrl = null;
    this.customTrackName = null;

    if (restartSynthIfEnabled && this.musicEnabled) {
      this.unlock();
      this.startSynthLoop();
    }
    this.emit();
  }

  private startMusic(): void {
    if (!this.musicEnabled || this.isDisposed) return;

    if (this.customTrackName && this.customAudioEl) {
      this.stopSynthLoop(true);
      this.customAudioEl.volume = this.musicVolume;
      this.customAudioEl.play().catch(() => {});
      return;
    }

    this.startSynthLoop();
  }

  private stopMusic(): void {
    this.stopSynthLoop(true);
    if (this.customAudioEl) {
      this.customAudioEl.pause();
    }
  }

  private stopSynthLoop(fadeVoices: boolean): void {
    this.songGenerationId += 1;

    if (this.songStepTimer !== null) {
      clearTimeout(this.songStepTimer);
      this.songStepTimer = null;
    }

    this.songCleanupTimers.forEach((timer) => clearTimeout(timer));
    this.songCleanupTimers.clear();

    if (fadeVoices && this.ctx) {
      const now = this.ctx.currentTime;
      this.activeVoices.forEach((voice) => {
        try {
          voice.gainNode.gain.cancelScheduledValues(now);
          voice.gainNode.gain.setValueAtTime(
            Math.max(0.0001, voice.gainNode.gain.value || 0.02),
            now
          );
          voice.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
          voice.oscillators.forEach((osc) => {
            try {
              osc.stop(now + 0.16);
            } catch {
              // Ignore already stopped oscillators
            }
          });
        } catch {
          // Ignore teardown errors
        }
      });
      this.activeVoices.clear();
    }
  }

  private startSynthLoop(): void {
    if (!this.musicEnabled || this.customTrackName || this.isDisposed) return;
    const ctx = this.ensureContext(true);
    if (!ctx || ctx.state !== 'running') return;

    if (this.songStepTimer !== null) return;

    const generation = ++this.songGenerationId;
    const song = RELAXING_SONGS[this.currentSongIndex] ?? RELAXING_SONGS[0];
    const chordCount = song.chordSteps.length;
    const totalChordSteps = chordCount * song.loopsPerTrack;
    let stepIndex = 0;

    // Cada execução ganha um tom, um ponto de partida e uma ordem de acordes diferentes.
    const run: SongRun = {
      ratio: Math.pow(2, this.randInt(-2, 2) / 12),
      melodyIdx: this.randInt(0, Math.max(0, song.melodyScale.length - 1)),
      motif: [],
      motifPos: 0,
      chordOrder: pickChordOrder(chordCount, this.rng),
    };

    if (this.delayWetGain) {
      this.delayWetGain.gain.setTargetAtTime(song.reverbMix, ctx.currentTime, 0.15);
    }

    const scheduleStep = () => {
      if (this.isDisposed || generation !== this.songGenerationId || !this.musicEnabled) {
        return;
      }

      if (stepIndex >= totalChordSteps) {
        // Song arrangement finished: smoothly advance to a different random song!
        this.songStepTimer = null;
        this.currentSongIndex = this.drawNextSongIndex();
        this.emit();
        this.startSynthLoop();
        return;
      }

      if (stepIndex > 0 && stepIndex % chordCount === 0) {
        run.chordOrder = pickChordOrder(chordCount, this.rng);
      }

      const chord = song.chordSteps[run.chordOrder[stepIndex % chordCount] ?? 0];
      const baseMs = this.songStepIntervalOverrideMs ?? song.stepIntervalMs;
      const stepMs =
        this.songStepIntervalOverrideMs !== undefined
          ? baseMs
          : Math.round(baseMs * (0.92 + this.rand() * 0.16));

      this.playSongStep(song, chord, stepMs, generation, run);

      stepIndex += 1;
      this.songStepTimer = setTimeout(scheduleStep, stepMs);
    };

    scheduleStep();
  }

  private registerVoice(
    oscillators: OscillatorNode[],
    gainNode: GainNode,
    stopAt: number,
    now: number
  ): void {
    const voice: ActiveVoice = { stopAt, oscillators, gainNode };
    this.activeVoices.add(voice);
    const cleanupDelayMs = Math.ceil((stopAt - now + 0.15) * 1000);
    const timer = setTimeout(() => {
      this.songCleanupTimers.delete(timer);
      this.activeVoices.delete(voice);
    }, cleanupDelayMs);
    this.songCleanupTimers.add(timer);
  }

  private playSongStep(
    song: RelaxingSong,
    chordFreqs: number[],
    stepMs: number,
    generation: number,
    run: SongRun
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBusGain || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const stepSeconds = stepMs / 1000;

    // 1. Warm chord pad: ora em bloco "rolado", ora arpejo descendo
    const rollSec = 0.04 + this.rand() * 0.14;
    const descending = this.rand() < 0.25;
    const voicing = descending ? [...chordFreqs].reverse() : chordFreqs;

    voicing.forEach((baseFreq, noteIdx) => {
      if (generation !== this.songGenerationId) return;
      const freq = baseFreq * run.ratio;

      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      const startAt = now + noteIdx * rollSec;
      osc.type = song.padWaveform;
      osc.frequency.setValueAtTime(freq, startAt);

      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(freq * 0.5, startAt);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(song.filterCutoffHz, now);

      const stopAt = startAt + stepSeconds + 0.35;
      const peakGain = 0.062 + this.rand() * 0.012;

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

      osc.connect(filter);
      subOsc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicBusGain!);
      if (this.delayNode) {
        gain.connect(this.delayNode);
      }

      osc.start(startAt);
      subOsc.start(startAt);
      osc.stop(stopAt + 0.05);
      subOsc.stop(stopAt + 0.05);

      this.registerVoice([osc, subOsc], gain, stopAt, now);
    });

    // 2. Baixo suave (fundamental uma oitava abaixo), na maioria dos compassos
    if (this.rand() < 0.7 && chordFreqs[0]) {
      const bassOsc = ctx.createOscillator();
      const bassFilter = ctx.createBiquadFilter();
      const bassGain = ctx.createGain();
      const bassStop = now + stepSeconds + 0.4;

      bassOsc.type = 'sine';
      bassOsc.frequency.setValueAtTime(chordFreqs[0] * 0.5 * run.ratio, now);
      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(420, now);

      bassGain.gain.setValueAtTime(0.0001, now);
      bassGain.gain.exponentialRampToValueAtTime(0.05, now + 0.4);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, bassStop);

      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(this.musicBusGain);

      bassOsc.start(now);
      bassOsc.stop(bassStop + 0.05);
      this.registerVoice([bassOsc], bassGain, bassStop, now);
    }

    // 3. Melodia gerada ao vivo (caminhada aleatória na escala + motivos repetidos)
    const scale = song.melodyScale;
    if (scale.length === 0) return;
    const density = song.melodyDensity ?? 0.5;
    const subBeats = this.rand() < 0.5 ? 2 : this.rand() < 0.6 ? 3 : 4;
    const slot = stepSeconds / subBeats;

    for (let subBeat = 0; subBeat < subBeats; subBeat += 1) {
      if (generation !== this.songGenerationId) return;
      const chance = subBeat === 0 ? Math.min(0.95, density * 1.3) : density * 0.85;
      if (this.rand() > chance) continue;

      let degree: number;
      if (run.motif.length >= 3 && this.rand() < 0.28) {
        degree = run.motif[run.motifPos % run.motif.length];
        run.motifPos += 1;
      } else {
        const moves = [-2, -1, -1, 0, 1, 1, 2];
        degree = run.melodyIdx + moves[this.randInt(0, moves.length - 1)];
        if (this.rand() < 0.07) degree += this.randInt(-3, 3);
        degree = Math.min(scale.length - 1, Math.max(0, degree));
        run.motif.push(degree);
        if (run.motif.length > 4) run.motif.shift();
      }
      run.melodyIdx = degree;

      const start = now + 0.15 + subBeat * slot + this.rand() * 0.03;
      const dur = Math.min(2.4, Math.max(0.9, slot * 1.6));
      this.playMelodyNote(
        scale[degree] * run.ratio,
        start,
        dur,
        song.melodyTimbre ?? 'soft',
        song.melodyWaveform,
        song.filterCutoffHz,
        now
      );
    }
  }

  private playMelodyNote(
    freq: number,
    start: number,
    dur: number,
    timbre: NonNullable<RelaxingSong['melodyTimbre']>,
    waveform: OscillatorType,
    cutoffHz: number,
    now: number
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBusGain) return;

    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffHz * 1.6, start);

    const oscs: OscillatorNode[] = [];
    const main = ctx.createOscillator();
    main.frequency.setValueAtTime(freq, start);
    oscs.push(main);
    main.connect(filter);

    let attack = 0.05;
    let peak = 0.045;
    let stop = start + dur;

    if (timbre === 'keys') {
      // Rhodes: fundamental + harmônico suave, ataque rápido e decaimento natural
      main.type = 'sine';
      const harm = ctx.createOscillator();
      harm.type = 'sine';
      harm.frequency.setValueAtTime(freq * 2, start);
      const harmGain = ctx.createGain();
      harmGain.gain.setValueAtTime(0.28, start);
      harm.connect(harmGain);
      harmGain.connect(filter);
      oscs.push(harm);
      attack = 0.012;
      peak = 0.05;
    } else if (timbre === 'bell') {
      // Sino: parcial inarmônico dá o brilho metálico e suave
      main.type = 'sine';
      const partial = ctx.createOscillator();
      partial.type = 'sine';
      partial.frequency.setValueAtTime(freq * 2.76, start);
      const partialGain = ctx.createGain();
      partialGain.gain.setValueAtTime(0.16, start);
      partial.connect(partialGain);
      partialGain.connect(filter);
      oscs.push(partial);
      attack = 0.008;
      peak = 0.04;
      stop = start + dur + 0.8;
    } else if (timbre === 'pluck') {
      main.type = 'triangle';
      attack = 0.006;
      peak = 0.052;
      stop = start + Math.min(dur, 1.1);
    } else {
      main.type = waveform;
      attack = 0.14;
      peak = 0.04;
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);

    filter.connect(gain);
    gain.connect(this.musicBusGain);
    if (this.delayNode) gain.connect(this.delayNode);

    oscs.forEach((o) => {
      o.start(start);
      o.stop(stop + 0.05);
    });
    this.registerVoice(oscs, gain, stop, now);
  }

  private getOrCreateRainBuffer(ctx: AudioContext): AudioBuffer {
    if (this.rainBuffer && this.rainBuffer.sampleRate === ctx.sampleRate) {
      return this.rainBuffer;
    }

    const durationSec = 4;
    const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Paul Kellet refined pink noise algorithm + soft droplet accents
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;

    for (let i = 0; i < length; i += 1) {
      const white = this.rng() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.075;
      b6 = white * 0.115926;

      // Occasional soft micro-droplet transient for authentic rain texture
      const drop = this.rng() < 0.0022 ? (this.rng() * 2 - 1) * 0.14 : 0;
      data[i] = Math.max(-0.95, Math.min(0.95, pink + drop));
    }

    // Crossfade loop seam (first/last 2048 samples) for seamless looping without clicks
    const fadeLen = Math.min(2048, Math.floor(length / 8));
    for (let i = 0; i < fadeLen; i += 1) {
      const t = i / fadeLen;
      const tailIdx = length - fadeLen + i;
      const blended = data[i] * t + data[tailIdx] * (1 - t);
      data[i] = blended;
      data[tailIdx] = blended;
    }

    this.rainBuffer = buffer;
    return buffer;
  }

  private startRain(): void {
    if (!this.rainEnabled || this.isDisposed) return;
    const ctx = this.ensureContext(true);
    if (!ctx || !this.rainBusGain || ctx.state !== 'running') return;

    const soundscape =
      BACKGROUND_SOUNDSCAPES[this.currentSoundscapeIndex] ?? BACKGROUND_SOUNDSCAPES[0];

    if (this.rainNodes) {
      if (this.rainNodes.kind === soundscape.kind) {
        this.rainNodes.outputGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.08);
        return;
      }
      this.stopRain();
    }

    const genId = ++this.rainGenerationId;
    const buffer = this.getOrCreateRainBuffer(ctx);

    const outputGain = ctx.createGain();
    outputGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    outputGain.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + 0.6);
    outputGain.connect(this.rainBusGain);

    const group: RainNodeGroup = {
      generationId: genId,
      kind: soundscape.kind,
      sources: [],
      lfos: [],
      nodes: [outputGain],
      outputGain,
      eventTimers: new Set(),
    };

    const scheduleSoundscapeEvent = (
      delayMs: number,
      fn: (currentCtx: AudioContext, targetGroup: RainNodeGroup) => void
    ) => {
      const timer = setTimeout(() => {
        group.eventTimers.delete(timer);
        if (this.isDisposed || genId !== this.rainGenerationId || !this.ctx) return;
        if (this.ctx.state !== 'running') return;
        fn(this.ctx, group);
      }, delayMs);
      group.eventTimers.add(timer);
    };

    const createNoiseLoop = (
      filterType: BiquadFilterType,
      cutoffHz: number,
      qValue: number,
      gainLevel: number
    ) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(cutoffHz, ctx.currentTime);
      if (filter.Q) {
        filter.Q.setValueAtTime(qValue, ctx.currentTime);
      }

      const layerGain = ctx.createGain();
      layerGain.gain.setValueAtTime(gainLevel, ctx.currentTime);

      source.connect(filter);
      filter.connect(layerGain);
      layerGain.connect(outputGain);
      source.start(ctx.currentTime);

      group.sources.push(source);
      group.nodes.push(source, filter, layerGain);
      return { source, filter, layerGain };
    };

    const attachLfo = (
      freqHz: number,
      depth: number,
      targetParam: AudioParam
    ) => {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(freqHz, ctx.currentTime);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(depth, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(targetParam);
      lfo.start(ctx.currentTime);
      group.lfos.push(lfo);
      group.nodes.push(lfo, lfoGain);
    };

    if (soundscape.kind === 'gentle-rain') {
      const steady = createNoiseLoop('lowpass', 760, 0.7, 0.68);
      createNoiseLoop('bandpass', 2200, 0.75, 0.24);
      attachLfo(0.12, 180, steady.filter.frequency);
    } else if (soundscape.kind === 'rain-thunder') {
      const steady = createNoiseLoop('lowpass', 640, 0.7, 0.72);
      createNoiseLoop('bandpass', 2100, 0.75, 0.26);
      attachLfo(0.1, 150, steady.filter.frequency);

      const triggerThunder = () => {
        if (this.isDisposed || genId !== this.rainGenerationId || !this.ctx) return;
        const c = this.ctx;
        const now = c.currentTime;

        const thunderSrc = c.createBufferSource();
        thunderSrc.buffer = buffer;
        thunderSrc.loop = true;

        const thunderFilter = c.createBiquadFilter();
        thunderFilter.type = 'lowpass';
        thunderFilter.frequency.setValueAtTime(160, now);
        thunderFilter.frequency.exponentialRampToValueAtTime(58, now + 4.4);

        const thunderGain = c.createGain();
        thunderGain.gain.setValueAtTime(0.0001, now);
        thunderGain.gain.exponentialRampToValueAtTime(0.85, now + 0.55);
        thunderGain.gain.exponentialRampToValueAtTime(0.28, now + 1.9);
        thunderGain.gain.exponentialRampToValueAtTime(0.0001, now + 4.6);

        thunderSrc.connect(thunderFilter);
        thunderFilter.connect(thunderGain);
        thunderGain.connect(outputGain);

        thunderSrc.start(now);
        thunderSrc.stop(now + 4.7);

        const nextDelay = 6500 + Math.floor(this.rng() * 7500);
        scheduleSoundscapeEvent(nextDelay, () => triggerThunder());
      };

      scheduleSoundscapeEvent(1600, () => triggerThunder());
    } else if (soundscape.kind === 'night-creatures') {
      // Soft nocturnal breeze bed
      const breeze = createNoiseLoop('lowpass', 380, 0.6, 0.36);
      attachLfo(0.08, 90, breeze.filter.frequency);

      // Periodic calm cricket chirps
      const triggerCrickets = () => {
        if (this.isDisposed || genId !== this.rainGenerationId || !this.ctx) return;
        const c = this.ctx;
        const now = c.currentTime;
        const baseFreq = 3900 + this.rng() * 550;
        const pulses = 3 + Math.floor(this.rng() * 2);

        for (let p = 0; p < pulses; p += 1) {
          const pStart = now + p * 0.085;
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(baseFreq, pStart);

          gain.gain.setValueAtTime(0.0001, pStart);
          gain.gain.exponentialRampToValueAtTime(0.032, pStart + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, pStart + 0.055);

          osc.connect(gain);
          gain.connect(outputGain);
          osc.start(pStart);
          osc.stop(pStart + 0.065);
        }

        const nextCricketMs = 1900 + Math.floor(this.rng() * 3200);
        scheduleSoundscapeEvent(nextCricketMs, () => triggerCrickets());
      };

      // Occasional distant soft owl hoot
      const triggerOwl = () => {
        if (this.isDisposed || genId !== this.rainGenerationId || !this.ctx) return;
        const c = this.ctx;
        const now = c.currentTime;
        const calls = [
          { offset: 0, dur: 0.45, fStart: 480, fEnd: 420 },
          { offset: 0.65, dur: 0.72, fStart: 450, fEnd: 375 },
        ];

        calls.forEach((call) => {
          const startAt = now + call.offset;
          const osc = c.createOscillator();
          const filter = c.createBiquadFilter();
          const gain = c.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(call.fStart, startAt);
          osc.frequency.exponentialRampToValueAtTime(call.fEnd, startAt + call.dur);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(900, startAt);

          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.045, startAt + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + call.dur);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(outputGain);
          osc.start(startAt);
          osc.stop(startAt + call.dur + 0.05);
        });

        const nextOwlMs = 8500 + Math.floor(this.rng() * 8000);
        scheduleSoundscapeEvent(nextOwlMs, () => triggerOwl());
      };

      scheduleSoundscapeEvent(600, () => triggerCrickets());
      scheduleSoundscapeEvent(3400, () => triggerOwl());
    } else if (soundscape.kind === 'cozy-fireplace') {
      // Warm low hearth roar
      const hearth = createNoiseLoop('lowpass', 260, 0.7, 0.78);
      attachLfo(0.18, 70, hearth.filter.frequency);

      // Gentle wood crackles
      const triggerCrackle = () => {
        if (this.isDisposed || genId !== this.rainGenerationId || !this.ctx) return;
        const c = this.ctx;
        const now = c.currentTime;

        const crackSrc = c.createBufferSource();
        crackSrc.buffer = buffer;
        crackSrc.loop = false;

        const crackFilter = c.createBiquadFilter();
        crackFilter.type = 'bandpass';
        crackFilter.frequency.setValueAtTime(1600 + this.rng() * 2400, now);
        if (crackFilter.Q) {
          crackFilter.Q.setValueAtTime(3.2, now);
        }

        const crackGain = c.createGain();
        const peak = 0.08 + this.rng() * 0.14;
        crackGain.gain.setValueAtTime(0.0001, now);
        crackGain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
        crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

        crackSrc.connect(crackFilter);
        crackFilter.connect(crackGain);
        crackGain.connect(outputGain);

        const offsetSec = this.rng() * 2.5;
        crackSrc.start(now, offsetSec, 0.065);

        const nextCrackleMs = 220 + Math.floor(this.rng() * 950);
        scheduleSoundscapeEvent(nextCrackleMs, () => triggerCrackle());
      };

      scheduleSoundscapeEvent(350, () => triggerCrackle());
    } else if (soundscape.kind === 'ocean-waves') {
      // Deep surf + shoreline foam rising & receding on an 11-second wave cycle
      const surf = createNoiseLoop('lowpass', 480, 0.7, 0.45);
      const foam = createNoiseLoop('bandpass', 1250, 0.6, 0.18);
      attachLfo(0.09, 320, surf.filter.frequency);
      attachLfo(0.09, 0.32, surf.layerGain.gain);
      attachLfo(0.09, 0.16, foam.layerGain.gain);
    } else if (soundscape.kind === 'forest-stream') {
      // Layered babbling water currents with dual ripples
      const flowLow = createNoiseLoop('bandpass', 640, 0.9, 0.56);
      const flowHigh = createNoiseLoop('bandpass', 1650, 1.1, 0.32);
      attachLfo(0.24, 180, flowLow.filter.frequency);
      attachLfo(0.37, 360, flowHigh.filter.frequency);
    }

    this.rainNodes = group;

    // Automatically end this ambient soundscape after its cycle and switch to a different random one
    const cycleDurationMs = this.soundscapeDurationOverrideMs ?? soundscape.durationMs;
    scheduleSoundscapeEvent(cycleDurationMs, () => {
      if (this.isDisposed || !this.rainEnabled || genId !== this.rainGenerationId) return;
      this.currentSoundscapeIndex = pickNextRandomSoundscapeIndex(
        this.currentSoundscapeIndex,
        BACKGROUND_SOUNDSCAPES.length,
        this.rng
      );
      this.stopRain();
      this.startRain();
      this.emit();
    });
  }

  private stopRain(): void {
    const nodes = this.rainNodes;
    if (!nodes) return;

    this.rainGenerationId += 1;
    this.rainNodes = null;

    nodes.eventTimers.forEach((timer) => clearTimeout(timer));
    nodes.eventTimers.clear();

    const ctx = this.ctx;
    if (!ctx) return;

    const now = ctx.currentTime;
    try {
      nodes.outputGain.gain.cancelScheduledValues(now);
      nodes.outputGain.gain.setValueAtTime(
        Math.max(0.0001, nodes.outputGain.gain.value || 1.0),
        now
      );
      nodes.outputGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    } catch {
      // Ignore fade errors
    }

    const cleanupTimer = setTimeout(() => {
      this.rainCleanupTimers.delete(cleanupTimer);
      nodes.sources.forEach((src) => {
        try {
          src.stop();
        } catch {
          // Ignore already stopped
        }
      });
      nodes.lfos.forEach((lfo) => {
        try {
          lfo.stop();
        } catch {
          // Ignore already stopped
        }
      });
      nodes.nodes.forEach((node) => {
        try {
          node.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      });
    }, 170);
    this.rainCleanupTimers.add(cleanupTimer);
  }

  public playScorePoint(): void {
    if (!this.sfxEnabled || this.isDisposed) return;
    const ctx = this.ensureContext(true);
    if (!ctx || !this.masterGain || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const notes = [659.25, 987.77];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.075);

      gain.gain.setValueAtTime(0.001, now + idx * 0.075);
      gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.075 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.075 + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.075);
      osc.stop(now + idx * 0.075 + 0.24);
    });
  }

  /** Som negativo de jogo ("trombone triste") — toca quando o usuário perde XP. */
  public playUncheckPoint(): void {
    this.playXpLoss();
  }

  public playXpLoss(): void {
    if (!this.sfxEnabled || this.isDisposed) return;
    const ctx = this.ensureContext(true);
    if (!ctx || !this.masterGain || ctx.state !== 'running') return;

    const now = ctx.currentTime;

    // Batida grave de impacto
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(130, now);
    thump.frequency.exponentialRampToValueAtTime(48, now + 0.22);
    thumpGain.gain.setValueAtTime(0.2, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    thump.connect(thumpGain);
    thumpGain.connect(this.masterGain);
    thump.start(now);
    thump.stop(now + 0.28);

    // "Wah-wah-wah-waaah" descendente (quatro notas)
    const notes = [
      { freq: 329.63, at: 0.0, len: 0.17 },
      { freq: 311.13, at: 0.19, len: 0.17 },
      { freq: 293.66, at: 0.38, len: 0.17 },
      { freq: 261.63, at: 0.57, len: 0.55, slideTo: 207.65 },
    ];
    notes.forEach((n) => {
      const start = now + 0.04 + n.at;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(n.freq, start);
      if (n.slideTo) {
        osc.frequency.exponentialRampToValueAtTime(n.slideTo, start + n.len);
      }

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1500, start);
      filter.frequency.exponentialRampToValueAtTime(520, start + n.len);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.085, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + n.len);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + n.len + 0.03);
    });
  }

  /** Sons de clique da interface: "pop" suave para botões, "tic" para marcar/desmarcar. */
  public playClick(kind: 'tap' | 'toggle' = 'tap'): void {
    if (!this.sfxEnabled || this.isDisposed) return;
    const ctx = this.ensureContext(true);
    if (!ctx || !this.masterGain || ctx.state !== 'running') return;

    const nowMs = Date.now();
    if (nowMs - this.lastClickAt < 35) return;
    this.lastClickAt = nowMs;

    const now = ctx.currentTime;
    // Variação leve de altura para não soar repetitivo
    const jitter = 0.97 + this.rand() * 0.06;

    interface ClickLayer {
      type: OscillatorType;
      freq: number;
      peak: number;
      len: number;
      at?: number;
      glide?: number;
    }
    const layers: ClickLayer[] =
      kind === 'toggle'
        ? [
            { type: 'sine', freq: 1318.5, peak: 0.06, len: 0.07 },
            { type: 'triangle', freq: 1975.5, peak: 0.035, len: 0.1, at: 0.035 },
          ]
        : [
            { type: 'triangle', freq: 880, peak: 0.07, len: 0.06, glide: 640 },
            { type: 'sine', freq: 1320, peak: 0.03, len: 0.09 },
          ];

    layers.forEach((layer) => {
      const start = now + (layer.at ?? 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = layer.type;
      osc.frequency.setValueAtTime(layer.freq * jitter, start);
      if (layer.glide) {
        osc.frequency.exponentialRampToValueAtTime(layer.glide * jitter, start + layer.len);
      }
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(layer.peak, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + layer.len);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + layer.len + 0.02);
    });
  }

  public dispose(): void {
    this.isDisposed = true;
    this.stopSynthLoop(true);
    this.stopRain();
    this.rainCleanupTimers.forEach((timer) => clearTimeout(timer));
    this.rainCleanupTimers.clear();
    this.clearCustomAudioInternal(false);
    this.listeners.clear();
    if (this.ctx && typeof this.ctx.close === 'function') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}
