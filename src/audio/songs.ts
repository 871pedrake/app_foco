import type { RelaxingSong } from '../types/foco';

/**
 * Músicas relaxantes geradas por "receita": tom, sequência de acordes, escala e timbre.
 * O motor de áudio recria a melodia, a ordem dos acordes, a tonalidade e o ritmo
 * a cada execução — então mesmo a mesma música nunca toca igual duas vezes.
 */

type ChordType = 'maj7' | 'min7' | 'dom7' | 'six' | 'min9' | 'maj9' | 'add9' | 'sus4';

const CHORD_INTERVALS: Record<ChordType, [number, number, number, number]> = {
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  six: [0, 4, 7, 9],
  min9: [0, 3, 7, 14],
  maj9: [0, 4, 11, 14],
  add9: [0, 4, 7, 14],
  sus4: [0, 5, 7, 14],
};

const SCALES = {
  majorPent: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
} as const;

type ScaleName = keyof typeof SCALES;

function midiToFreq(midi: number): number {
  return Math.round(440 * Math.pow(2, (midi - 69) / 12) * 100) / 100;
}

/** Acorde aberto: fundamental, quinta, sétima/nona e terça uma oitava acima. */
function buildChord(keyMidi: number, offset: number, type: ChordType): number[] {
  let root = keyMidi + offset;
  while (root > 56) root -= 12;
  while (root < 45) root += 12;
  const [, third, fifth, seventh] = CHORD_INTERVALS[type];
  return [root, root + fifth, root + seventh, root + third + 12]
    .sort((a, b) => a - b)
    .map(midiToFreq);
}

/** Escala em ~1,5 oitava, começando perto de Dó5. */
function buildScale(keyMidi: number, scale: ScaleName): number[] {
  let start = keyMidi;
  while (start < 69) start += 12;
  while (start > 80) start -= 12;
  const notes: number[] = [];
  for (let octave = 0; octave < 2; octave += 1) {
    for (const interval of SCALES[scale]) {
      const midi = start + octave * 12 + interval;
      if (midi <= start + 19) notes.push(midiToFreq(midi));
    }
  }
  return notes;
}

/** Padrão inicial determinístico (usado só como "semente" do motivo). */
function seedPattern(id: string, scaleLength: number): (number | null)[] {
  let seed = 0;
  for (let i = 0; i < id.length; i += 1) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  const out: (number | null)[] = [];
  for (let i = 0; i < 16; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const r = (seed >>> 8) % 100;
    out.push(r < 38 ? null : r % scaleLength);
  }
  return out;
}

interface SongRecipe {
  id: string;
  title: string;
  subtitle: string;
  key: number;
  progression: Array<[number, ChordType]>;
  scale: ScaleName;
  stepIntervalMs: number;
  padWaveform: OscillatorType;
  melodyWaveform: OscillatorType;
  melodyTimbre: NonNullable<RelaxingSong['melodyTimbre']>;
  melodyDensity: number;
  filterCutoffHz: number;
  reverbMix: number;
}

const A = 57;
const Bb = 58;
const C = 60;
const D = 62;
const Eb = 63;
const E = 64;
const F = 65;
const G = 67;
const Ab = 68;

const RECIPES: SongRecipe[] = [
  {
    id: 'noite-de-neblina',
    title: 'Noite de Neblina',
    subtitle: 'Acordes suaves em Rhodes e pads noturnos',
    key: A,
    progression: [[0, 'min7'], [8, 'maj7'], [10, 'six'], [7, 'min7']],
    scale: 'minorPent',
    stepIntervalMs: 3600,
    padWaveform: 'sine',
    melodyWaveform: 'triangle',
    melodyTimbre: 'keys',
    melodyDensity: 0.5,
    filterCutoffHz: 980,
    reverbMix: 0.34,
  },
  {
    id: 'jardim-de-bambu',
    title: 'Jardim de Bambu',
    subtitle: 'Pentatônica oriental calma e brisa leve',
    key: G,
    progression: [[0, 'add9'], [9, 'min7'], [5, 'maj7'], [7, 'six']],
    scale: 'majorPent',
    stepIntervalMs: 3200,
    padWaveform: 'triangle',
    melodyWaveform: 'sine',
    melodyTimbre: 'pluck',
    melodyDensity: 0.55,
    filterCutoffHz: 1120,
    reverbMix: 0.38,
  },
  {
    id: 'lago-silencioso',
    title: 'Lago Silencioso',
    subtitle: 'Piano aveludado e quintas cristalinas',
    key: F,
    progression: [[0, 'maj7'], [7, 'add9'], [9, 'min7'], [2, 'sus4']],
    scale: 'majorPent',
    stepIntervalMs: 4000,
    padWaveform: 'sine',
    melodyWaveform: 'sine',
    melodyTimbre: 'keys',
    melodyDensity: 0.42,
    filterCutoffHz: 860,
    reverbMix: 0.42,
  },
  {
    id: 'chuva-na-varanda',
    title: 'Chuva na Varanda',
    subtitle: 'Voicings lo-fi quentes em Ré menor',
    key: D,
    progression: [[0, 'min9'], [5, 'dom7'], [10, 'maj7'], [7, 'min7']],
    scale: 'minorPent',
    stepIntervalMs: 3400,
    padWaveform: 'triangle',
    melodyWaveform: 'triangle',
    melodyTimbre: 'keys',
    melodyDensity: 0.5,
    filterCutoffHz: 900,
    reverbMix: 0.3,
  },
  {
    id: 'horizonte-calmo',
    title: 'Horizonte Calmo',
    subtitle: 'Harmônicos lídios flutuantes e graves suaves',
    key: Eb,
    progression: [[0, 'maj7'], [2, 'six'], [4, 'min7'], [9, 'min9']],
    scale: 'lydian',
    stepIntervalMs: 3800,
    padWaveform: 'sine',
    melodyWaveform: 'triangle',
    melodyTimbre: 'soft',
    melodyDensity: 0.45,
    filterCutoffHz: 1020,
    reverbMix: 0.4,
  },
  {
    id: 'amanhecer-na-serra',
    title: 'Amanhecer na Serra',
    subtitle: 'Sinos claros sobre acordes abertos de manhã',
    key: C,
    progression: [[0, 'maj7'], [4, 'min7'], [5, 'maj7'], [7, 'six']],
    scale: 'majorPent',
    stepIntervalMs: 3600,
    padWaveform: 'sine',
    melodyWaveform: 'sine',
    melodyTimbre: 'bell',
    melodyDensity: 0.45,
    filterCutoffHz: 1100,
    reverbMix: 0.4,
  },
  {
    id: 'cafe-de-domingo',
    title: 'Café de Domingo',
    subtitle: 'Jazz leve e dedilhado com ar de tarde preguiçosa',
    key: Bb,
    progression: [[0, 'maj7'], [9, 'min7'], [2, 'min7'], [7, 'dom7']],
    scale: 'major',
    stepIntervalMs: 3000,
    padWaveform: 'triangle',
    melodyWaveform: 'triangle',
    melodyTimbre: 'pluck',
    melodyDensity: 0.6,
    filterCutoffHz: 1000,
    reverbMix: 0.28,
  },
  {
    id: 'floresta-encantada',
    title: 'Floresta Encantada',
    subtitle: 'Caixinha de música em modo dórico misterioso',
    key: E,
    progression: [[0, 'min7'], [7, 'min7'], [8, 'maj7'], [10, 'six']],
    scale: 'dorian',
    stepIntervalMs: 3300,
    padWaveform: 'sine',
    melodyWaveform: 'sine',
    melodyTimbre: 'bell',
    melodyDensity: 0.5,
    filterCutoffHz: 1050,
    reverbMix: 0.42,
  },
  {
    id: 'luar-sobre-o-mar',
    title: 'Luar sobre o Mar',
    subtitle: 'Pads largos e lentos, como maré prateada',
    key: Ab,
    progression: [[0, 'maj7'], [9, 'min7'], [5, 'maj7'], [7, 'six']],
    scale: 'majorPent',
    stepIntervalMs: 4400,
    padWaveform: 'sine',
    melodyWaveform: 'sine',
    melodyTimbre: 'soft',
    melodyDensity: 0.38,
    filterCutoffHz: 820,
    reverbMix: 0.45,
  },
  {
    id: 'estrelas-distantes',
    title: 'Estrelas Distantes',
    subtitle: 'Cintilações agudas num céu aberto',
    key: E,
    progression: [[0, 'maj7'], [9, 'min7'], [5, 'maj7'], [7, 'six']],
    scale: 'majorPent',
    stepIntervalMs: 3800,
    padWaveform: 'sine',
    melodyWaveform: 'sine',
    melodyTimbre: 'bell',
    melodyDensity: 0.4,
    filterCutoffHz: 1150,
    reverbMix: 0.46,
  },
  {
    id: 'folhas-ao-vento',
    title: 'Folhas ao Vento',
    subtitle: 'Notas leves que dançam em Lá menor',
    key: A,
    progression: [[0, 'min7'], [5, 'min7'], [10, 'dom7'], [3, 'maj7']],
    scale: 'minorPent',
    stepIntervalMs: 3000,
    padWaveform: 'triangle',
    melodyWaveform: 'triangle',
    melodyTimbre: 'pluck',
    melodyDensity: 0.58,
    filterCutoffHz: 980,
    reverbMix: 0.32,
  },
  {
    id: 'biblioteca-silenciosa',
    title: 'Biblioteca Silenciosa',
    subtitle: 'Piano macio para estudar com a mente quieta',
    key: G,
    progression: [[0, 'min9'], [8, 'maj7'], [3, 'maj7'], [10, 'six']],
    scale: 'minorPent',
    stepIntervalMs: 4000,
    padWaveform: 'sine',
    melodyWaveform: 'triangle',
    melodyTimbre: 'keys',
    melodyDensity: 0.4,
    filterCutoffHz: 880,
    reverbMix: 0.36,
  },
  {
    id: 'trilha-na-nevoa',
    title: 'Trilha na Névoa',
    subtitle: 'Caminhada lenta em dórico, sem pressa',
    key: D,
    progression: [[0, 'min7'], [5, 'six'], [10, 'maj7'], [7, 'min7']],
    scale: 'dorian',
    stepIntervalMs: 4200,
    padWaveform: 'sine',
    melodyWaveform: 'sine',
    melodyTimbre: 'soft',
    melodyDensity: 0.4,
    filterCutoffHz: 900,
    reverbMix: 0.4,
  },
  {
    id: 'brisa-de-verao',
    title: 'Brisa de Verão',
    subtitle: 'Acordes ensolarados e notas saltitantes',
    key: A,
    progression: [[0, 'maj7'], [9, 'min7'], [2, 'min7'], [7, 'six']],
    scale: 'majorPent',
    stepIntervalMs: 3000,
    padWaveform: 'triangle',
    melodyWaveform: 'triangle',
    melodyTimbre: 'pluck',
    melodyDensity: 0.6,
    filterCutoffHz: 1180,
    reverbMix: 0.3,
  },
  {
    id: 'por-do-sol',
    title: 'Pôr do Sol',
    subtitle: 'Cores quentes e lídio dourado no fim do dia',
    key: Bb,
    progression: [[0, 'maj7'], [9, 'min9'], [5, 'maj7'], [7, 'six']],
    scale: 'lydian',
    stepIntervalMs: 3700,
    padWaveform: 'sine',
    melodyWaveform: 'triangle',
    melodyTimbre: 'keys',
    melodyDensity: 0.46,
    filterCutoffHz: 1000,
    reverbMix: 0.38,
  },
  {
    id: 'vale-sereno',
    title: 'Vale Sereno',
    subtitle: 'Sinos suaves e acordes simples em Dó',
    key: C,
    progression: [[0, 'add9'], [9, 'min7'], [5, 'maj7'], [7, 'six']],
    scale: 'majorPent',
    stepIntervalMs: 3400,
    padWaveform: 'triangle',
    melodyWaveform: 'sine',
    melodyTimbre: 'bell',
    melodyDensity: 0.48,
    filterCutoffHz: 1050,
    reverbMix: 0.36,
  },
  {
    id: 'sonho-profundo',
    title: 'Sonho Profundo',
    subtitle: 'Graves aveludados para desacelerar de vez',
    key: E,
    progression: [[0, 'min9'], [8, 'maj9'], [3, 'maj7'], [10, 'six']],
    scale: 'minorPent',
    stepIntervalMs: 4400,
    padWaveform: 'sine',
    melodyWaveform: 'sine',
    melodyTimbre: 'soft',
    melodyDensity: 0.34,
    filterCutoffHz: 780,
    reverbMix: 0.46,
  },
];

export const RELAXING_SONGS: RelaxingSong[] = RECIPES.map((r) => {
  const melodyScale = buildScale(r.key, r.scale);
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    stepIntervalMs: r.stepIntervalMs,
    chordSteps: r.progression.map(([offset, type]) => buildChord(r.key, offset, type)),
    melodyScale,
    melodyPattern: seedPattern(r.id, melodyScale.length),
    padWaveform: r.padWaveform,
    melodyWaveform: r.melodyWaveform,
    filterCutoffHz: r.filterCutoffHz,
    reverbMix: r.reverbMix,
    loopsPerTrack: 4,
    melodyTimbre: r.melodyTimbre,
    melodyDensity: r.melodyDensity,
  };
});

function clampRandom(raw: number): number {
  return Number.isFinite(raw) ? Math.min(0.9999999, Math.max(0, raw)) : 0;
}

/**
 * Picks a random song index from [0, totalSongs - 1], guaranteed not to
 * immediately repeat `currentIndex` whenever `totalSongs > 1`.
 */
export function pickNextRandomSongIndex(
  currentIndex: number,
  totalSongs: number = RELAXING_SONGS.length,
  rng: () => number = Math.random
): number {
  if (totalSongs <= 1) return 0;
  const safeCurrent = currentIndex >= 0 && currentIndex < totalSongs ? currentIndex : -1;
  const candidates: number[] = [];
  for (let i = 0; i < totalSongs; i += 1) {
    if (i !== safeCurrent) {
      candidates.push(i);
    }
  }
  const pick = Math.floor(clampRandom(rng()) * candidates.length);
  return candidates[pick] ?? 0;
}

/**
 * "Saco de sorteio": embaralha todas as músicas e só repete depois que todas
 * tocaram. Nunca devolve a música atual no começo de uma nova rodada.
 */
export function buildShuffledSongBag(
  currentIndex: number,
  totalSongs: number = RELAXING_SONGS.length,
  rng: () => number = Math.random
): number[] {
  const bag: number[] = [];
  for (let i = 0; i < totalSongs; i += 1) {
    if (i !== currentIndex) bag.push(i);
  }
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(clampRandom(rng()) * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/** Ordem em que os acordes da progressão tocam em cada volta (varia sempre). */
export function pickChordOrder(count: number, rng: () => number = Math.random): number[] {
  const base = Array.from({ length: count }, (_, i) => i);
  if (count < 3) return base;
  const r = clampRandom(rng());
  if (r < 0.35) return base;
  if (r < 0.7) {
    const k = 1 + Math.floor(clampRandom(rng()) * (count - 1));
    return base.map((_, i) => (i + k) % count);
  }
  if (r < 0.85) return [...base].reverse();
  const i = Math.floor(clampRandom(rng()) * (count - 1));
  const swapped = [...base];
  [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
  return swapped;
}
