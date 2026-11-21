import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CloudRain,
  Flame,
  Moon,
  Music,
  Rocket,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trees,
  Upload,
  User,
  Volume2,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import { RELAXING_SONGS } from '../audio/songs';
import { BACKGROUND_SOUNDSCAPES } from '../audio/soundscapes';
import type {
  AudioStatusSnapshot,
  BackgroundSoundscape,
  MainTab,
  NavbarXpNotification,
  UserProfile,
} from '../types/foco';
import { formatXp } from '../utils/xp';
import { PWAInstallButton } from './PWAInstallButton';

export function formatNavbarXpNotice(notice: NavbarXpNotification): {
  deltaText: string;
  detailText: string;
  isPositive: boolean;
} {
  const isPositive = notice.delta > 0;
  const deltaText = `${formatXp(notice.delta, true)} XP`;
  let detailText =
    notice.source === 'journal' ? 'Diário' : notice.source === 'vice' ? 'Recaída' : 'Tarefa';
  if (isPositive && notice.leveledUpTo) {
    detailText = `Nível ${notice.leveledUpTo}!`;
  } else if (!isPositive && notice.leveledDownTo) {
    detailText = `Voltou ao Nível ${notice.leveledDownTo}`;
  }
  return { deltaText, detailText, isPositive };
}

interface HeaderProps {
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  headerDateText: string;
  resetCountdownText: string;
  isDark: boolean;
  onToggleTheme: () => void;
  onSimulateDay: () => void;
  audioStatus: AudioStatusSnapshot;
  onToggleMusic: () => void;
  onToggleRain: () => void;
  onToggleSfx: () => void;
  onNextRandomSong: () => void;
  onSelectSong: (index: number) => void;
  onNextRandomSoundscape: () => void;
  onSelectSoundscape: (index: number) => void;
  onRandomizeAll: () => void;
  onChangeMusicVolume: (volume: number) => void;
  onChangeRainVolume: (volume: number) => void;
  onUploadCustomMusic: (file: File) => void;
  onClearCustomMusic: () => void;
  totalXp: number;
  xpNotice: NavbarXpNotification | null;
  profile: UserProfile;
  onOpenImpulse: () => void;
}

function renderSoundscapeIcon(kind: BackgroundSoundscape['kind'], className = 'w-3.5 h-3.5 shrink-0') {
  switch (kind) {
    case 'rain-thunder':
      return <Zap className={className} />;
    case 'night-creatures':
      return <Trees className={className} />;
    case 'cozy-fireplace':
      return <Flame className={className} />;
    case 'ocean-waves':
      return <Waves className={className} />;
    case 'forest-stream':
      return <Waves className={className} />;
    case 'gentle-rain':
    default:
      return <CloudRain className={className} />;
  }
}

export function Header({
  activeTab,
  onSelectTab,
  headerDateText,
  resetCountdownText,
  isDark,
  onToggleTheme,
  onSimulateDay,
  audioStatus,
  onToggleMusic,
  onToggleRain,
  onToggleSfx,
  onNextRandomSong,
  onSelectSong,
  onNextRandomSoundscape,
  onSelectSoundscape,
  onRandomizeAll,
  onChangeMusicVolume,
  onChangeRainVolume,
  onUploadCustomMusic,
  onClearCustomMusic,
  totalXp,
  xpNotice,
  profile,
  onOpenImpulse,
}: HeaderProps) {
  const [mixerOpen, setMixerOpen] = useState(false);
  const [rocketLaunching, setRocketLaunching] = useState(false);
  const mixerWrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rocketLaunchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (rocketLaunchTimerRef.current) {
        clearTimeout(rocketLaunchTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mixerOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (mixerWrapperRef.current && !mixerWrapperRef.current.contains(e.target as Node)) {
        setMixerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [mixerOpen]);

  const activeSongTitle = audioStatus.customTrackName
    ? audioStatus.customTrackName
    : audioStatus.currentSong.title;

  const activeSoundscape = audioStatus.currentSoundscape;

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-50/90 dark:bg-slate-950/90 border-b border-slate-200/80 dark:border-slate-800/80">
      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                Foco
              </h1>
              <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 capitalize">
                {headerDateText}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              {resetCountdownText}
            </p>
          </div>

          <nav
            aria-label="Seções principais"
            className="inline-flex flex-wrap items-center gap-0.5 p-1 rounded-xl bg-slate-200/75 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-full"
          >
            <button
              type="button"
              onClick={() => onSelectTab('tasks')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'tasks'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {activeTab === 'tasks' && (
                <motion.span
                  layoutId="header-active-tab"
                  transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                  className="absolute inset-0 rounded-lg bg-white dark:bg-slate-800 shadow-xs"
                />
              )}
              <span className="relative z-10">Tarefas &amp; Histórico</span>
            </button>
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={() => onSelectTab('levels')}
                className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'levels'
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                } ${
                  xpNotice
                    ? xpNotice.delta > 0
                      ? 'ring-2 ring-emerald-400/75 dark:ring-emerald-400/70'
                      : 'ring-2 ring-rose-400/75 dark:ring-rose-400/70'
                    : ''
                }`}
              >
                {activeTab === 'levels' && (
                  <motion.span
                    layoutId="header-active-tab"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                    className="absolute inset-0 rounded-lg bg-white dark:bg-slate-800 shadow-xs"
                  />
                )}
                <span className="relative z-10">Níveis &amp; XP</span>
              </button>

              <AnimatePresence>
                {xpNotice && (() => {
                  const { deltaText, detailText, isPositive } = formatNavbarXpNotice(xpNotice);
                  return (
                    <motion.div
                      key={xpNotice.id}
                      initial={{ opacity: 0, y: -6, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.92 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                      role="status"
                      aria-live="polite"
                      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-lg whitespace-nowrap border ${
                        isPositive
                          ? 'bg-emerald-600 dark:bg-emerald-500 text-white border-emerald-400/60'
                          : 'bg-rose-600 dark:bg-rose-500 text-white border-rose-400/60'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-bold tabular-nums">{deltaText}</span>
                      <span aria-hidden="true" className="opacity-75">·</span>
                      <span>{detailText}</span>
                      <span aria-hidden="true" className="opacity-75">·</span>
                      <span className="tabular-nums opacity-95">Total {formatXp(totalXp)} XP</span>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>
            <button
              type="button"
              onClick={() => onSelectTab('journal')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'journal'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {activeTab === 'journal' && (
                <motion.span
                  layoutId="header-active-tab"
                  transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                  className="absolute inset-0 rounded-lg bg-white dark:bg-slate-800 shadow-xs"
                />
              )}
              <span className="relative z-10">Seu Diário</span>
            </button>

            <motion.button
              type="button"
              data-no-click-sound="true"
              onClick={() => {
                setRocketLaunching(true);
                if (rocketLaunchTimerRef.current) {
                  clearTimeout(rocketLaunchTimerRef.current);
                }
                rocketLaunchTimerRef.current = setTimeout(() => {
                  setRocketLaunching(false);
                  rocketLaunchTimerRef.current = null;
                }, 560);
                onOpenImpulse();
              }}
              whileHover={{ scale: 1.12, rotate: -8 }}
              whileTap={{ scale: 0.9 }}
              animate={{ scale: rocketLaunching ? 1.16 : 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              aria-label="Impulso — frear vontade e sair da inércia"
              title="Impulso (foguete): clique se estiver pensando em alguma besteira"
              className="relative w-10 h-10 -my-1.5 mx-1.5 rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-white shadow-md shadow-orange-500/35 ring-2 ring-white/90 dark:ring-slate-950 flex items-center justify-center cursor-pointer shrink-0 overflow-visible"
            >
              <AnimatePresence>
                {rocketLaunching && (
                  <motion.span
                    key="rocket-shockwave"
                    initial={{ scale: 0.85, opacity: 0.9 }}
                    animate={{ scale: 2.35, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full border-2 border-amber-300/90 bg-orange-400/25"
                  />
                )}
                {rocketLaunching && (
                  <motion.span
                    key="rocket-glow"
                    initial={{ scale: 0.9, opacity: 0.8 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full bg-amber-400/50 blur-sm"
                  />
                )}
              </AnimatePresence>
              <motion.span
                aria-hidden="true"
                animate={
                  rocketLaunching
                    ? {
                        x: [0, -1.5, 1.5, 18, 0],
                        y: [0, 1.5, -1.5, -20, 0],
                        rotate: [0, -10, 8, 18, 0],
                        scale: [1, 0.9, 1.25, 0.65, 1],
                        opacity: [1, 1, 1, 0, 1],
                      }
                    : { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }
                }
                transition={{ duration: 0.54, times: [0, 0.14, 0.28, 0.62, 1], ease: 'easeOut' }}
                className="relative z-10 inline-flex items-center justify-center"
              >
                <Rocket className="w-4 h-4" />
              </motion.span>
            </motion.button>

            <button
              type="button"
              onClick={() => onSelectTab('vices')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'vices'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {activeTab === 'vices' && (
                <motion.span
                  layoutId="header-active-tab"
                  transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                  className="absolute inset-0 rounded-lg bg-white dark:bg-slate-800 shadow-xs"
                />
              )}
              <span className="relative z-10">Seus Vícios</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('impulseHistory')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'impulseHistory'
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {activeTab === 'impulseHistory' && (
                <motion.span
                  layoutId="header-active-tab"
                  transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                  className="absolute inset-0 rounded-lg bg-white dark:bg-slate-800 shadow-xs"
                />
              )}
              <span className="relative z-10">Histórico do Impulso</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('profile')}
              className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'profile'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {activeTab === 'profile' && (
                <motion.span
                  layoutId="header-active-tab"
                  transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                  className="absolute inset-0 rounded-lg bg-white dark:bg-slate-800 shadow-xs"
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                {profile.photoDataUrl ? (
                  <img
                    src={profile.photoDataUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-4 h-4 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <User className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="max-w-[96px] truncate">
                  {profile.name ? profile.name : 'Perfil'}
                </span>
              </span>
            </button>
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onSimulateDay}
            title="Avançar para o próximo dia e testar o reset de 24h"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/25 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Simular Novo Dia
          </button>

          {/* Ambient Audio Controls + Mixer Popover */}
          <div ref={mixerWrapperRef} className="relative flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleMusic}
              aria-label="Alternar música relaxante"
              title={
                audioStatus.musicEnabled
                  ? `Tocando: ${activeSongTitle} (clique para pausar)`
                  : 'Música pausada (clique para ativar)'
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                audioStatus.musicEnabled
                  ? 'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
                  : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
              }`}
            >
              <Music className="w-3.5 h-3.5 shrink-0" />
              {audioStatus.musicEnabled && (
                <span aria-hidden="true" className="inline-flex items-end gap-[2px] h-3 shrink-0">
                  <span className="w-[2px] h-full rounded-full bg-current origin-bottom animate-eq-1" />
                  <span className="w-[2px] h-full rounded-full bg-current origin-bottom animate-eq-2" />
                  <span className="w-[2px] h-full rounded-full bg-current origin-bottom animate-eq-3" />
                </span>
              )}
              <span className="max-w-[125px] truncate">
                {audioStatus.musicEnabled ? activeSongTitle : 'Música: Pausada'}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleRain}
              aria-label="Alternar som ambiente de fundo"
              title={
                audioStatus.rainEnabled
                  ? `Ambiente: ${activeSoundscape.title} (clique para pausar)`
                  : 'Som ambiente pausado (clique para ativar)'
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                audioStatus.rainEnabled
                  ? 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 border-sky-500/30'
                  : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
              }`}
            >
              {renderSoundscapeIcon(activeSoundscape.kind)}
              <span className="max-w-[130px] truncate">
                {audioStatus.rainEnabled ? activeSoundscape.title : 'Ambiente: Off'}
              </span>
            </button>

            <button
              type="button"
              onClick={onRandomizeAll}
              aria-label="Sortear nova música e novo som ambiente"
              title="Sortear música e ambiente aleatórios"
              className="p-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setMixerOpen((prev) => !prev)}
              aria-expanded={mixerOpen}
              aria-label="Abrir mixer de músicas e sons ambientes"
              title="Abrir mixer de 5 músicas relaxantes e 6 sons ambientes"
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                mixerOpen
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>

            <AnimatePresence>
              {mixerOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  role="dialog"
                  aria-label="Mixer de Som Ambiente"
                  className="absolute right-0 top-full mt-2 w-80 sm:w-[420px] max-h-[82vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 space-y-4 z-50 origin-top-right"
                >
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2.5 gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Som Ambiente Aleatório
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      5 músicas + 6 cenários · trocam sozinhos ao acabar
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onRandomizeAll}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                    >
                      <Shuffle className="w-3 h-3" />
                      Tudo aleatório
                    </button>
                    <button
                      type="button"
                      onClick={() => setMixerOpen(false)}
                      aria-label="Fechar mixer"
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Music & Soundscape Volume Sliders */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-indigo-500" />
                        Volume da Música
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                        {Math.round(audioStatus.musicVolume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(audioStatus.musicVolume * 100)}
                      onChange={(e) => onChangeMusicVolume(Number(e.target.value) / 100)}
                      aria-label="Volume da música"
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        {renderSoundscapeIcon(activeSoundscape.kind, 'w-3.5 h-3.5 text-sky-500')}
                        Volume do Ambiente ({activeSoundscape.title})
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                        {Math.round(audioStatus.rainVolume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(audioStatus.rainVolume * 100)}
                      onChange={(e) => onChangeRainVolume(Number(e.target.value) / 100)}
                      aria-label="Volume do som ambiente"
                      className="w-full accent-sky-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 6 Background Soundscapes List */}
                <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      6 Sons de Fundo (Aleatório ao entrar)
                    </span>
                    <button
                      type="button"
                      onClick={onNextRandomSoundscape}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-300 cursor-pointer"
                    >
                      <Shuffle className="w-3 h-3" />
                      Sortear som
                    </button>
                  </div>

                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {BACKGROUND_SOUNDSCAPES.map((sc, idx) => {
                      const isCurrent = audioStatus.currentSoundscapeIndex === idx;
                      return (
                        <li key={sc.id}>
                          <button
                            type="button"
                            onClick={() => onSelectSoundscape(idx)}
                            className={`w-full text-left px-2.5 py-2 rounded-xl border transition-colors cursor-pointer flex items-start gap-2 ${
                              isCurrent
                                ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-400/50 text-sky-700 dark:text-sky-200'
                                : 'bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 border-slate-200/70 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="mt-0.5 shrink-0">
                              {renderSoundscapeIcon(sc.kind, 'w-3.5 h-3.5')}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold truncate">{sc.title}</div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                                {sc.subtitle}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Relaxing Songs List */}
                <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {RELAXING_SONGS.length} Músicas Relaxantes (sempre diferentes)
                    </span>
                    <button
                      type="button"
                      onClick={onNextRandomSong}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 cursor-pointer"
                    >
                      <Shuffle className="w-3 h-3" />
                      Sortear música
                    </button>
                  </div>

                  <ul className="space-y-1 max-h-72 overflow-y-auto pr-1">
                    {RELAXING_SONGS.map((song, idx) => {
                      const isCurrent =
                        !audioStatus.customTrackName && audioStatus.currentSongIndex === idx;
                      return (
                        <li key={song.id}>
                          <button
                            type="button"
                            onClick={() => onSelectSong(idx)}
                            className={`w-full text-left px-2.5 py-2 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                              isCurrent
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400/50 text-indigo-700 dark:text-indigo-200'
                                : 'bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 border-slate-200/70 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">
                                {idx + 1}. {song.title}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {song.subtitle}
                              </div>
                            </div>
                            <span className="text-[11px] font-medium shrink-0">
                              {isCurrent && audioStatus.musicEnabled ? 'Tocando' : 'Tocar'}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Custom Audio Upload */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUploadCustomMusic(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{audioStatus.customTrackName ? 'Trocar arquivo' : 'Música própria'}</span>
                  </button>
                  {audioStatus.customTrackName && (
                    <button
                      type="button"
                      onClick={onClearCustomMusic}
                      className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Voltar às 5 músicas
                    </button>
                  )}
                </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={onToggleSfx}
            aria-label="Alternar efeitos sonoros do app"
            title="Efeitos sonoros: pontos, perda de XP e cliques"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              audioStatus.sfxEnabled
                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>{audioStatus.sfxEnabled ? 'Som: Ligado' : 'Som: Mudo'}</span>
          </button>

          <PWAInstallButton compact />

          <motion.button
            type="button"
            onClick={onToggleTheme}
            whileTap={{ scale: 0.9, rotate: 18 }}
            aria-label="Alternar tema claro ou escuro"
            title="Alternar tema"
            className="p-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer shrink-0"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </motion.button>
        </div>
      </div>
    </header>
  );
}
