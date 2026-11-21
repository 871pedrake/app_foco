import type { BackgroundSoundscape } from '../types/foco';

export const BACKGROUND_SOUNDSCAPES: BackgroundSoundscape[] = [
  {
    id: 'gentle-rain',
    title: 'Chuva Suave',
    subtitle: 'Chuva contínua com gotas leves no telhado',
    durationMs: 75000,
    kind: 'gentle-rain',
  },
  {
    id: 'rain-thunder',
    title: 'Chuva com Trovões',
    subtitle: 'Tempestade calma com trovões graves distantes',
    durationMs: 84000,
    kind: 'rain-thunder',
  },
  {
    id: 'night-creatures',
    title: 'Noite na Floresta',
    subtitle: 'Grilos suaves, coruja distante e brisa noturna',
    durationMs: 80000,
    kind: 'night-creatures',
  },
  {
    id: 'cozy-fireplace',
    title: 'Lareira Aconchegante',
    subtitle: 'Fogo quente estalando devagar na madeira',
    durationMs: 72000,
    kind: 'cozy-fireplace',
  },
  {
    id: 'ocean-waves',
    title: 'Ondas do Oceano',
    subtitle: 'Maré lenta subindo e recuando na areia',
    durationMs: 88000,
    kind: 'ocean-waves',
  },
  {
    id: 'forest-stream',
    title: 'Riacho na Mata',
    subtitle: 'Água corrente calma entre pedras e folhas',
    durationMs: 76000,
    kind: 'forest-stream',
  },
];

export function pickNextRandomSoundscapeIndex(
  currentIndex: number,
  totalSoundscapes: number = BACKGROUND_SOUNDSCAPES.length,
  rng: () => number = Math.random
): number {
  if (totalSoundscapes <= 1) return 0;
  const safeCurrent =
    currentIndex >= 0 && currentIndex < totalSoundscapes ? currentIndex : -1;
  const candidates: number[] = [];
  for (let i = 0; i < totalSoundscapes; i += 1) {
    if (i !== safeCurrent) {
      candidates.push(i);
    }
  }
  const raw = rng();
  const clamped = Number.isFinite(raw) ? Math.min(0.9999999, Math.max(0, raw)) : 0;
  const pick = Math.floor(clamped * candidates.length);
  return candidates[pick] ?? 0;
}
