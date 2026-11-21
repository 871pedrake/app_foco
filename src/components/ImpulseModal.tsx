import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Footprints,
  History,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Timer,
  Wind,
  X,
} from 'lucide-react';
import type { ImpulseLog } from '../types/foco';

export interface ImpulseActionChallenge {
  id: string;
  title: string;
  tag: string;
  instruction: string;
  durationSec: number;
}

export const IMPULSE_CHALLENGES: ImpulseActionChallenge[] = [
  {
    id: 'walk',
    title: 'Levante e ande agora',
    tag: 'Movimento',
    instruction:
      'Saia de onde está sentado(a) ou deitado(a) e caminhe pelo quarto, corredor ou quintal por 60 segundos.',
    durationSec: 60,
  },
  {
    id: 'water',
    title: 'Copo de água fria',
    tag: 'Corpo',
    instruction:
      'Vá até a cozinha, encha um copo grande com água bem fria e beba devagar sentindo a mudança de estado.',
    durationSec: 45,
  },
  {
    id: 'face',
    title: 'Água gelada no rosto',
    tag: 'Choque leve',
    instruction:
      'Vá ao banheiro, jogue água fria no rosto e nos pulsos para dar um reset imediato e acordar a mente.',
    durationSec: 45,
  },
  {
    id: 'pushups',
    title: '15 flexões ou polichinelos',
    tag: 'Energia',
    instruction:
      'Descarregue a tensão parada agora fazendo 15 repetições rápidas ou agachamentos no lugar.',
    durationSec: 45,
  },
  {
    id: 'away-phone',
    title: 'Celular em outro cômodo',
    tag: 'Barreira',
    instruction:
      'Deixe o celular ou computador fora do seu alcance físico por alguns minutos e vá para outro ponto da casa.',
    durationSec: 60,
  },
  {
    id: 'window',
    title: 'Janela e horizonte',
    tag: 'Ar livre',
    instruction:
      'Afaste o olhar da tela, vá até uma janela ou porta e foque no ponto mais distante que enxergar por 60 segundos.',
    durationSec: 60,
  },
  {
    id: 'tidy',
    title: 'Arrume algo em 60s',
    tag: 'Mãos ocupadas',
    instruction:
      'Dobre uma roupa, organize a mesa ou lave uma louça rápida para ocupar as mãos e sair do piloto automático.',
    durationSec: 60,
  },
  {
    id: 'change-room',
    title: 'Mude de cômodo agora',
    tag: 'Cenário',
    instruction:
      'Levante e vá para a sala, cozinha ou área externa. Trocar o ambiente visual quebra o gatilho do hábito.',
    durationSec: 60,
  },
  {
    id: 'stretch',
    title: 'Alongamento em pé',
    tag: 'Corpo',
    instruction:
      'Estique os braços lá em cima, gire os ombros para trás e solte o pescoço devagar por 45 segundos.',
    durationSec: 45,
  },
  {
    id: 'brush-teeth',
    title: 'Escove os dentes ou menta',
    tag: 'Sensorial',
    instruction:
      'Escove os dentes ou tome algo refrescante de menta para mudar o estímulo sensorial imediatamente.',
    durationSec: 60,
  },
  {
    id: 'cold-shower',
    title: 'Banho rápido / água nos braços',
    tag: 'Reset total',
    instruction:
      'Se a vontade estiver muito forte, molhe os braços, nuca ou tome um banho rápido para virar a chave.',
    durationSec: 90,
  },
  {
    id: 'call-someone',
    title: 'Fale com alguém agora',
    tag: 'Conexão',
    instruction:
      'Quebre o isolamento: mande um áudio para um amigo, converse com alguém em casa ou saia para perto de pessoas.',
    durationSec: 60,
  },
];

export type BreathingPhase = 'inspire' | 'hold' | 'exhale' | 'rest';

export interface BreathingStep {
  phase: BreathingPhase;
  shortLabel: string;
  label: string;
  seconds: number;
}

export interface BreathingPattern {
  id: string;
  name: string;
  timingLabel: string;
  summary: string;
  steps: BreathingStep[];
}

export const BREATHING_PATTERNS: BreathingPattern[] = [
  {
    id: 'calm-446',
    name: 'Calma Rápida',
    timingLabel: '4-4-6',
    summary: 'Equilibra batimentos e reduz a urgência em poucos ciclos.',
    steps: [
      { phase: 'inspire', shortLabel: 'Inspire', label: 'Inspire fundo pelo nariz', seconds: 4 },
      { phase: 'hold', shortLabel: 'Segure', label: 'Segure o ar com calma', seconds: 4 },
      { phase: 'exhale', shortLabel: 'Expire', label: 'Solte devagar pela boca', seconds: 6 },
    ],
  },
  {
    id: 'box-4444',
    name: 'Respiração Quadrada',
    timingLabel: '4-4-4-4',
    summary: 'Foco e controle emocional imediato em 4 tempos iguais.',
    steps: [
      { phase: 'inspire', shortLabel: 'Inspire', label: 'Inspire suave pelo nariz', seconds: 4 },
      { phase: 'hold', shortLabel: 'Segure', label: 'Mantenha o ar nos pulmões', seconds: 4 },
      { phase: 'exhale', shortLabel: 'Expire', label: 'Esvazie os pulmões devagar', seconds: 4 },
      { phase: 'rest', shortLabel: 'Vazio', label: 'Aguarde em silêncio antes de puxar', seconds: 4 },
    ],
  },
  {
    id: 'physiological-sigh',
    name: 'Suspiro Duplo',
    timingLabel: '2+1-6',
    summary: 'Duas puxadas seguidas + soltura longa para cortar ansiedade rápido.',
    steps: [
      { phase: 'inspire', shortLabel: 'Puxe 2x', label: 'Puxe fundo + mais um golinho de ar', seconds: 3 },
      { phase: 'exhale', shortLabel: 'Solte', label: 'Solte todo o ar bem devagar pela boca', seconds: 6 },
    ],
  },
  {
    id: 'deep-478',
    name: 'Freio Profundo',
    timingLabel: '4-7-8',
    summary: 'Desaceleração profunda para impulsos fortes à noite ou deitado.',
    steps: [
      { phase: 'inspire', shortLabel: 'Inspire', label: 'Inspire silenciosamente pelo nariz', seconds: 4 },
      { phase: 'hold', shortLabel: 'Segure', label: 'Segure firme e relaxe os ombros', seconds: 7 },
      { phase: 'exhale', shortLabel: 'Expire', label: 'Solte bem devagar fazendo um som suave', seconds: 8 },
    ],
  },
];

export function pickRandomItemIndex(
  length: number,
  excludeIndex?: number,
  rng: () => number = Math.random
): number {
  if (length <= 1) return 0;
  const candidate = Math.floor(rng() * length) % length;
  if (excludeIndex !== undefined && candidate === excludeIndex) {
    return (candidate + 1) % length;
  }
  return candidate;
}

const QUICK_THOUGHT_SUGGESTIONS = [
  'Abrir vídeo curto / feed sem parar',
  'Ceder a um impulso por tédio ou estresse',
  'Procrastinar fugindo para distração',
  'Pensamento negativo / autossabotagem',
];

type ImpulseStep = 'write' | 'breathing' | 'check-control' | 'challenge' | 'done';

interface ImpulseModalProps {
  open: boolean;
  onClose: () => void;
  onRecordThought: (thought: string) => ImpulseLog | null;
  onCompleteExercise: (
    logId: string,
    actionTaken: string,
    breathingCycles: number,
    completedExercise: boolean
  ) => void;
  onOpenHistory: () => void;
}

export function ImpulseModal({
  open,
  onClose,
  onRecordThought,
  onCompleteExercise,
  onOpenHistory,
}: ImpulseModalProps) {
  const [step, setStep] = useState<ImpulseStep>('write');
  const [thought, setThought] = useState('');
  const [activeLog, setActiveLog] = useState<ImpulseLog | null>(null);

  // Random breathing timer state
  const [breathPatternIndex, setBreathPatternIndex] = useState(0);
  const [breathingActive, setBreathingActive] = useState(false);
  const [breathPhaseIndex, setBreathPhaseIndex] = useState(0);
  const [breathSecondsLeft, setBreathSecondsLeft] = useState(
    BREATHING_PATTERNS[0].steps[0].seconds
  );
  const [completedBreathCycles, setCompletedBreathCycles] = useState(0);

  // 2nd random escape challenge state (shown if user answers "Não estou no controle")
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [challengeRound, setChallengeRound] = useState(1);
  const [attemptedChallenges, setAttemptedChallenges] = useState<string[]>([]);
  const [movementRunning, setMovementRunning] = useState(false);
  const [movementSecondsLeft, setMovementSecondsLeft] = useState(
    IMPULSE_CHALLENGES[0].durationSec
  );
  const [movementDone, setMovementDone] = useState(false);

  // Reset modal cleanly whenever opened
  useEffect(() => {
    if (!open) return;
    setStep('write');
    setThought('');
    setActiveLog(null);

    const randomBreathIdx = pickRandomItemIndex(BREATHING_PATTERNS.length);
    setBreathPatternIndex(randomBreathIdx);
    setBreathingActive(false);
    setBreathPhaseIndex(0);
    setBreathSecondsLeft(BREATHING_PATTERNS[randomBreathIdx].steps[0].seconds);
    setCompletedBreathCycles(0);

    const randomChallengeIdx = pickRandomItemIndex(IMPULSE_CHALLENGES.length);
    setChallengeIndex(randomChallengeIdx);
    setChallengeRound(1);
    setAttemptedChallenges([]);
    setMovementRunning(false);
    setMovementSecondsLeft(IMPULSE_CHALLENGES[randomChallengeIdx].durationSec);
    setMovementDone(false);
  }, [open]);

  const activePattern = BREATHING_PATTERNS[breathPatternIndex];
  const currentBreath = activePattern.steps[breathPhaseIndex] || activePattern.steps[0];
  const currentChallenge = IMPULSE_CHALLENGES[challengeIndex];

  // Breathing interval
  useEffect(() => {
    if (!open || step !== 'breathing' || !breathingActive) return;

    const timer = setInterval(() => {
      setBreathSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;

        const nextPhaseIdx = (breathPhaseIndex + 1) % activePattern.steps.length;
        if (nextPhaseIdx === 0) {
          setCompletedBreathCycles((c) => c + 1);
        }
        setBreathPhaseIndex(nextPhaseIdx);
        return activePattern.steps[nextPhaseIdx].seconds;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [open, step, breathingActive, breathPhaseIndex, activePattern]);

  // Challenge countdown interval
  useEffect(() => {
    if (!open || step !== 'challenge' || !movementRunning) return;

    const timer = setInterval(() => {
      setMovementSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;
        setMovementRunning(false);
        setMovementDone(true);
        return 0;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [open, step, movementRunning]);

  // Escape key closes modal
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleSaveThought(e: React.FormEvent) {
    e.preventDefault();
    const clean = thought.trim();
    if (!clean) return;
    const created = onRecordThought(clean);
    if (!created) return;

    // Pick a random breathing mode right as step 1 -> breathing starts
    const randomBreathIdx = pickRandomItemIndex(BREATHING_PATTERNS.length);
    setBreathPatternIndex(randomBreathIdx);
    setBreathPhaseIndex(0);
    setBreathSecondsLeft(BREATHING_PATTERNS[randomBreathIdx].steps[0].seconds);
    setCompletedBreathCycles(0);

    setActiveLog(created);
    setStep('breathing');
    setBreathingActive(true);
  }

  function handleRandomizeBreathing() {
    const nextIdx = pickRandomItemIndex(BREATHING_PATTERNS.length, breathPatternIndex);
    setBreathPatternIndex(nextIdx);
    setBreathPhaseIndex(0);
    setBreathSecondsLeft(BREATHING_PATTERNS[nextIdx].steps[0].seconds);
    setBreathingActive(true);
  }

  function handleProceedToControlCheck() {
    setBreathingActive(false);
    setStep('check-control');
  }

  function handleStartRandomChallenge(isAnotherRound = false) {
    const nextIdx = pickRandomItemIndex(
      IMPULSE_CHALLENGES.length,
      isAnotherRound ? challengeIndex : undefined
    );
    const chosen = IMPULSE_CHALLENGES[nextIdx];
    setChallengeIndex(nextIdx);
    setChallengeRound((prev) => (isAnotherRound ? prev + 1 : 1));
    setAttemptedChallenges((prev) =>
      prev.includes(chosen.title) ? prev : [...prev, chosen.title]
    );
    setMovementRunning(false);
    setMovementDone(false);
    setMovementSecondsLeft(chosen.durationSec);
    setStep('challenge');
  }

  function handleFinishInControl(fromChallenge: boolean) {
    if (activeLog) {
      const breathText =
        completedBreathCycles > 0
          ? `${activePattern.name} ${activePattern.timingLabel} (${completedBreathCycles} ${completedBreathCycles === 1 ? 'ciclo' : 'ciclos'})`
          : `${activePattern.name} (${activePattern.timingLabel})`;

      const challengesList = fromChallenge
        ? attemptedChallenges.includes(currentChallenge.title)
          ? attemptedChallenges
          : [...attemptedChallenges, currentChallenge.title]
        : [];

      const actionTaken =
        challengesList.length > 0
          ? `${breathText} + ${challengesList.join(' + ')}`
          : `${breathText} · No controle`;

      onCompleteExercise(activeLog.id, actionTaken, completedBreathCycles, true);
    }
    setBreathingActive(false);
    setMovementRunning(false);
    setStep('done');
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="impulse-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#070c1b] text-slate-100 border border-orange-500/35 shadow-2xl shadow-orange-950/40 p-5 sm:p-7 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/30 shrink-0">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <h2 id="impulse-modal-title" className="text-lg sm:text-xl font-extrabold text-white">
                Modo Impulso · Freio de Emergência
              </h2>
              <p className="text-xs text-slate-400">
                Sem XP, sem pontuação — apenas clareza para sair da inércia agora.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Modo Impulso"
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1: Ask what the user was about to do */}
        {step === 'write' && (
          <form onSubmit={handleSaveThought} className="space-y-4">
            <div className="rounded-2xl bg-[#0b1228] border border-slate-800 p-4 space-y-3">
              <label
                htmlFor="impulse-thought-input"
                className="block text-sm font-bold text-white"
              >
                O que você estava pensando em fazer agora?
              </label>
              <p className="text-xs text-slate-400">
                Coloque para fora em uma frase. Esse registro fica guardado com data e hora no{' '}
                <strong className="text-orange-300">Histórico do Impulso</strong> e não vale nenhum ponto.
              </p>

              <div className="flex flex-wrap gap-1.5">
                {QUICK_THOUGHT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setThought(suggestion)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <textarea
                id="impulse-thought-input"
                rows={3}
                autoFocus
                required
                value={thought}
                onChange={(e) => setThought(e.target.value)}
                placeholder="Ex.: Estava quase pegando o celular para ver vídeo curto sem parar..."
                className="w-full rounded-xl bg-[#060a17] text-white placeholder-slate-500 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/60 px-3.5 py-2.5 text-sm resize-y"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-[11px] text-slate-400">
                0 XP · Salvo automaticamente no Histórico do Impulso
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!thought.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:brightness-110 disabled:opacity-45 text-white shadow-md shadow-orange-500/20 transition-all cursor-pointer"
                >
                  <Rocket className="w-4 h-4" />
                  <span>Guardar e iniciar respiração</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* STEP 2: Randomly chosen Breathing Mode */}
        {step === 'breathing' && activeLog && (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-950/35 border border-emerald-500/35 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
              <span className="text-emerald-200 truncate">
                Registrado às <strong className="font-mono">{activeLog.timeStr}</strong>: “{activeLog.thought}”
              </span>
              <span className="text-[11px] font-semibold text-emerald-300 shrink-0">0 XP</span>
            </div>

            <div className="rounded-2xl bg-[#0b1228] border border-indigo-500/35 p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                    1º Passo · Respiração sorteada
                  </span>
                  <h3 className="text-base sm:text-lg font-extrabold text-white mt-0.5 flex items-center gap-2">
                    <Wind className="w-4 h-4 text-sky-400" />
                    <span>
                      {activePattern.name} ({activePattern.timingLabel})
                    </span>
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={handleRandomizeBreathing}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 hover:text-sky-200 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Sortear outra</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                  <div
                    className={`w-28 h-28 rounded-full border-2 flex flex-col items-center justify-center transition-all duration-1000 ${
                      !breathingActive
                        ? 'scale-95 bg-sky-950/40 border-sky-500/40'
                        : currentBreath.phase === 'inspire'
                          ? 'scale-110 bg-sky-500/25 border-sky-400 shadow-lg shadow-sky-500/25'
                          : currentBreath.phase === 'hold'
                            ? 'scale-110 bg-indigo-500/25 border-indigo-400 shadow-lg shadow-indigo-500/25'
                            : currentBreath.phase === 'rest'
                              ? 'scale-90 bg-slate-800/70 border-slate-500/70'
                              : 'scale-90 bg-emerald-500/20 border-emerald-400/70'
                    }`}
                  >
                    <span className="text-3xl font-black text-white tabular-nums">
                      {breathSecondsLeft}s
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-sky-200">
                      {currentBreath.shortLabel}
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-2.5 text-center sm:text-left">
                  <p className="text-base font-bold text-white">{currentBreath.label}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{activePattern.summary}</p>
                  <p className="text-xs font-semibold text-sky-300 tabular-nums">
                    {completedBreathCycles} {completedBreathCycles === 1 ? 'ciclo completo' : 'ciclos completos'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setBreathingActive((prev) => !prev)}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-sky-200 border border-sky-500/35 cursor-pointer"
                    >
                      {breathingActive ? 'Pausar respiração' : 'Retomar respiração'}
                    </button>
                    <button
                      type="button"
                      onClick={handleProceedToControlCheck}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                    >
                      Terminei de respirar →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Ask if the user is in control */}
        {step === 'check-control' && activeLog && (
          <div className="rounded-2xl bg-[#0b1228] border border-indigo-500/40 p-6 text-center space-y-5">
            <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-400/50 text-indigo-300 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div className="space-y-1.5 max-w-md mx-auto">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                2º Passo · Checagem rápida
              </span>
              <h3 className="text-xl font-extrabold text-white">Você já está no controle?</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Seja sincero(a) consigo agora. Se a vontade ainda estiver forte, vou sortear um{' '}
                <strong className="text-orange-300">2º desafio aleatório</strong> para você quebrar a inércia de vez.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => handleFinishInControl(false)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Sim, estou no controle</span>
              </button>

              <button
                type="button"
                onClick={() => handleStartRandomChallenge(false)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:brightness-110 text-white shadow-md shadow-orange-500/25 transition-all cursor-pointer"
              >
                <Footprints className="w-4 h-4" />
                <span>Não, me dê um 2º desafio aleatório</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: 2nd Random Challenge (Escapatória) */}
        {step === 'challenge' && activeLog && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#0b1228] border border-orange-500/40 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400">
                    2º Desafio Aleatório · Escapatória #{challengeRound}
                  </span>
                  <h3 className="text-base sm:text-lg font-extrabold text-white mt-0.5 flex items-center gap-2">
                    <Footprints className="w-4 h-4 text-orange-400" />
                    <span>{currentChallenge.title}</span>
                  </h3>
                </div>

                <span className="text-[11px] font-semibold text-orange-300 bg-orange-500/15 border border-orange-500/30 px-2.5 py-1 rounded-lg">
                  {currentChallenge.tag} · {currentChallenge.durationSec}s
                </span>
              </div>

              <div className="rounded-xl bg-[#070c1a] border border-slate-800/90 p-4 space-y-2">
                <p className="text-sm text-slate-200 leading-relaxed">
                  {currentChallenge.instruction}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {movementDone ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                    Desafio concluído! Como você está agora?
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMovementRunning((prev) => !prev)}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer tabular-nums ${
                      movementRunning
                        ? 'bg-orange-600/25 text-orange-200 border-orange-400/50'
                        : 'bg-orange-600 hover:bg-orange-500 text-white border-orange-500'
                    }`}
                  >
                    <Timer className="w-3.5 h-3.5" />
                    <span>
                      {movementRunning
                        ? `Fazendo agora... ${movementSecondsLeft}s (pausar)`
                        : `Iniciar desafio (${movementSecondsLeft}s)`}
                    </span>
                  </button>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartRandomChallenge(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-orange-200 border border-orange-500/35 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Ainda não · Outro desafio</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFinishInControl(true)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                  >
                    Estou no controle · Concluir
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Done */}
        {step === 'done' && (
          <div className="rounded-2xl bg-[#0b1228] border border-emerald-500/40 p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-extrabold text-white">Impulso freado!</h3>
              <p className="text-xs sm:text-sm text-slate-300">
                Você retomou o controle sem ceder. O registro com data, hora e o que foi feito já está salvo no{' '}
                <strong className="text-orange-300">Histórico do Impulso</strong> (0 XP).
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenHistory();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-orange-200 border border-orange-500/35 cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
                <span>Ver Histórico do Impulso</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
              >
                Voltar ao Foco
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
