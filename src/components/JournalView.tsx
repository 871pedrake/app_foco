import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Unlock } from 'lucide-react';
import { JOURNAL_MOODS, type JournalEntry, type JournalMood } from '../types/foco';
import { formatDateKey, formatFullPtDate, getLocalTodayKey, parseDateKey } from '../utils/date';
import { hasJournalContent } from '../utils/xp';

interface JournalViewProps {
  entries: Record<string, JournalEntry>;
  todayKey?: string;
  onSaveEntry: (dateKey: string, entry: JournalEntry) => void;
  onClearEntry: (dateKey: string) => void;
  onClose: () => void;
}

const SHORT_MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export function shouldJournalAutoLock(entry: JournalEntry | undefined): boolean {
  return hasJournalContent(entry);
}

export function getNextJournalLockAfterSave(draftDump: string, draftGratitude: string): boolean {
  return Boolean(draftDump.trim() || draftGratitude.trim());
}

export function JournalView({
  entries,
  todayKey: todayKeyProp,
  onSaveEntry,
  onClearEntry,
  onClose,
}: JournalViewProps) {
  const todayKey = todayKeyProp || getLocalTodayKey();
  const todayDt = parseDateKey(todayKey);

  const [viewYear, setViewYear] = useState(todayDt.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayDt.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);

  const currentSavedEntry = entries[selectedDateKey];
  const [dump, setDump] = useState(currentSavedEntry?.dump || '');
  const [gratitude, setGratitude] = useState(currentSavedEntry?.gratitude || '');
  const [mood, setMood] = useState<JournalMood>(currentSavedEntry?.mood || 'Bom');
  const [isLocked, setIsLocked] = useState<boolean>(() =>
    shouldJournalAutoLock(entries[todayKey])
  );

  const prevSelectedDateRef = useRef<string>(selectedDateKey);

  useEffect(() => {
    const saved = entries[selectedDateKey];
    const didChangeDate = prevSelectedDateRef.current !== selectedDateKey;
    prevSelectedDateRef.current = selectedDateKey;

    setDump(saved?.dump || '');
    setGratitude(saved?.gratitude || '');
    setMood(saved?.mood || 'Bom');

    if (didChangeDate) {
      setIsLocked(shouldJournalAutoLock(saved));
    } else if (!hasJournalContent(saved)) {
      setIsLocked(false);
    }
  }, [selectedDateKey, entries]);

  const hasSavedContent = hasJournalContent(currentSavedEntry);
  const hasDraftContent = getNextJournalLockAfterSave(dump, gratitude);
  const hasUnsavedChanges =
    dump.trim() !== (currentSavedEntry?.dump || '').trim() ||
    gratitude.trim() !== (currentSavedEntry?.gratitude || '').trim() ||
    (hasSavedContent && mood !== (currentSavedEntry?.mood || 'Bom'));

  const showPadlockControl = isLocked || hasSavedContent || hasDraftContent;

  const calendarMeta = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay();
    const monthLabel = firstDay.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });

    let writtenCount = 0;
    const days: { day: number; key: string; written: boolean }[] = [];
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dt = new Date(viewYear, viewMonth, d, 12, 0, 0);
      const key = formatDateKey(dt);
      const written = hasJournalContent(entries[key]);
      if (written) writtenCount += 1;
      days.push({ day: d, key, written });
    }

    return { monthLabel, startWeekday, daysInMonth, writtenCount, days };
  }, [viewYear, viewMonth, entries]);

  const annualMeta = useMemo(() => {
    let totalYearEntries = 0;
    const monthCounts = SHORT_MONTHS.map((label, mIdx) => {
      const prefix = `${viewYear}-${String(mIdx + 1).padStart(2, '0')}-`;
      const count = Object.keys(entries).filter(
        (k) => k.startsWith(prefix) && hasJournalContent(entries[k])
      ).length;
      totalYearEntries += count;
      return { label, mIdx, count };
    });
    return { totalYearEntries, monthCounts };
  }, [viewYear, entries]);

  function handleJumpToday() {
    const tKey = todayKeyProp || getLocalTodayKey();
    const dt = parseDateKey(tKey);
    setViewYear(dt.getFullYear());
    setViewMonth(dt.getMonth());
    setSelectedDateKey(tKey);
  }

  function handleSaveCurrentEntry() {
    const nextEntry: JournalEntry = {
      dump: dump.trim(),
      gratitude: gratitude.trim(),
      mood,
      updatedAt: Date.now(),
    };
    onSaveEntry(selectedDateKey, nextEntry);
    if (getNextJournalLockAfterSave(nextEntry.dump, nextEntry.gratitude)) {
      setIsLocked(true);
    } else {
      setIsLocked(false);
    }
  }

  function handleClearCurrentEntry() {
    if (isLocked) return;
    onClearEntry(selectedDateKey);
    setIsLocked(false);
  }

  function handleTogglePadlock() {
    if (isLocked) {
      setIsLocked(false);
      return;
    }

    if (!hasDraftContent) {
      return;
    }

    if (hasUnsavedChanges || !hasSavedContent) {
      handleSaveCurrentEntry();
    } else {
      setIsLocked(true);
    }
  }

  return (
    <section className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24">
      <div className="rounded-3xl bg-[#070b19] text-slate-100 border border-indigo-950/90 shadow-2xl p-5 sm:p-7 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-indigo-400">
              Externalizar pensamento · Registrar vida
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-0.5">
              Seu <span className="text-indigo-400">diário</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {hasSavedContent
                ? '+1 XP garantido por escrever neste dia · Use o cadeado no canto direito para proteger ou editar'
                : 'Escreva e salve hoje para ganhar +1 XP · Não escrever custa -0,5 XP ao fechar o dia'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleJumpToday}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Fechar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Calendar + Monthly Progress + 12 Months Grid */}
          <div className="lg:col-span-5 rounded-2xl bg-[#0b1226] border border-slate-800/90 p-4 sm:p-5 space-y-5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold">Ano</span>
              <span className="font-mono tabular-nums text-slate-200 font-semibold">{viewYear}</span>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white capitalize">{calendarMeta.monthLabel}</h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Mês anterior do diário"
                  onClick={() => {
                    if (viewMonth === 0) {
                      setViewMonth(11);
                      setViewYear((y) => y - 1);
                    } else {
                      setViewMonth((m) => m - 1);
                    }
                  }}
                  className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Próximo mês do diário"
                  onClick={() => {
                    if (viewMonth === 11) {
                      setViewMonth(0);
                      setViewYear((y) => y + 1);
                    } else {
                      setViewMonth((m) => m + 1);
                    }
                  }}
                  className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-slate-500">
              <span>D</span>
              <span>S</span>
              <span>T</span>
              <span>Q</span>
              <span>Q</span>
              <span>S</span>
              <span>S</span>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: calendarMeta.startWeekday }).map((_, i) => (
                <div key={`j-sp-${i}`} className="h-8" />
              ))}
              {calendarMeta.days.map(({ day, key, written }) => {
                const isSelected = key === selectedDateKey;
                let cls =
                  'h-8 rounded-lg text-xs tabular-nums transition-all cursor-pointer flex flex-col items-center justify-center relative ';
                if (isSelected) {
                  cls += 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-300/60';
                } else if (written) {
                  cls += 'bg-indigo-950/80 text-indigo-200 border border-indigo-500/40 font-semibold';
                } else {
                  cls += 'bg-slate-900/60 text-slate-400 hover:bg-slate-800/80';
                }
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDateKey(key)}
                    className={cls}
                  >
                    <span>{day}</span>
                    {written && !isSelected && (
                      <span className="w-1 h-1 rounded-full bg-indigo-400 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
              <span className="inline-flex items-center gap-2 text-slate-400">
                <span className="w-2 h-2 rounded-xs bg-indigo-400" />
                escreveu
              </span>
              <span className="font-bold text-white tabular-nums">
                {calendarMeta.writtenCount} de {calendarMeta.daysInMonth} dias
              </span>
            </div>

            <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-slate-400">
                <span>ANO {viewYear}</span>
                <span className="text-indigo-400 tabular-nums">
                  {annualMeta.totalYearEntries}{' '}
                  {annualMeta.totalYearEntries === 1 ? 'ENTRADA' : 'ENTRADAS'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {annualMeta.monthCounts.map(({ label, mIdx, count }) => {
                  const isCurrentMonth = mIdx === viewMonth;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setViewMonth(mIdx);
                        const maxDay = new Date(viewYear, mIdx + 1, 0).getDate();
                        const curDay = Math.min(maxDay, parseDateKey(selectedDateKey).getDate());
                        setSelectedDateKey(
                          formatDateKey(new Date(viewYear, mIdx, curDay, 12, 0, 0))
                        );
                      }}
                      className={
                        isCurrentMonth
                          ? 'p-2 rounded-xl bg-indigo-950/80 border border-indigo-500/60 text-left transition-colors cursor-pointer'
                          : 'p-2 rounded-xl bg-slate-900/70 hover:bg-slate-800/80 border border-slate-800/80 text-left transition-colors cursor-pointer'
                      }
                    >
                      <div
                        className={`text-[10px] font-bold tracking-wider ${
                          isCurrentMonth ? 'text-indigo-300' : 'text-slate-400'
                        }`}
                      >
                        {label}
                      </div>
                      <div className="text-xs font-bold text-white mt-0.5 tabular-nums">{count}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Daily Entry + Gratitude + Mood */}
          <div className="lg:col-span-7 rounded-2xl bg-[#0b1226] border border-slate-800/90 p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-indigo-400">
                  Entrada do dia
                </p>
                <h3 className="text-lg font-bold text-white mt-0.5 capitalize">
                  {formatFullPtDate(selectedDateKey)}
                </h3>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  {hasSavedContent
                    ? `${isLocked ? 'Protegido · ' : 'Em edição · '}Salvo · ${
                        currentSavedEntry?.mood || 'Bom'
                      }`
                    : 'Ainda não escrito neste dia'}
                </span>

                {showPadlockControl && (
                  <button
                    type="button"
                    onClick={handleTogglePadlock}
                    aria-pressed={!isLocked}
                    aria-label={
                      isLocked
                        ? 'Desbloquear entrada do diário para editar'
                        : 'Travar entrada do diário contra edições acidentais'
                    }
                    title={
                      isLocked
                        ? 'Clique para desbloquear e editar'
                        : 'Clique para travar contra apagamento acidental'
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                      isLocked
                        ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40'
                        : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {isLocked ? (
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{isLocked ? 'Bloqueado' : 'Desbloqueado'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="journal-dump-input"
                  className="block text-xs font-semibold tracking-wider text-slate-300"
                >
                  Descarrego e log
                </label>
                {isLocked && (
                  <span className="text-[11px] font-medium text-amber-300/90">
                    Somente leitura · clique no cadeado para editar
                  </span>
                )}
              </div>
              <textarea
                id="journal-dump-input"
                rows={6}
                value={dump}
                readOnly={isLocked}
                aria-readonly={isLocked}
                onChange={(e) => {
                  if (!isLocked) setDump(e.target.value);
                }}
                title={
                  isLocked
                    ? 'Texto travado para evitar apagar sem querer. Clique no cadeado no canto direito para editar.'
                    : undefined
                }
                placeholder="O que aconteceu hoje, o que passou pela cabeça, o que ficou pendente..."
                className={`w-full rounded-xl p-3.5 text-sm leading-relaxed resize-y border transition-colors focus:outline-none ${
                  isLocked
                    ? 'bg-[#060a16] text-slate-200 placeholder-slate-600 border-amber-500/30 cursor-not-allowed focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50'
                    : 'bg-[#070c1a] text-slate-100 placeholder-slate-500 border-slate-800 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500'
                }`}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="journal-gratitude-input"
                className="block text-xs font-semibold tracking-wider text-slate-300"
              >
                Gratidão · opcional
              </label>
              <input
                id="journal-gratitude-input"
                type="text"
                value={gratitude}
                readOnly={isLocked}
                aria-readonly={isLocked}
                onChange={(e) => {
                  if (!isLocked) setGratitude(e.target.value);
                }}
                title={
                  isLocked
                    ? 'Campo travado. Clique no cadeado para desbloquear.'
                    : undefined
                }
                placeholder="Uma coisa boa de hoje, por menor que seja..."
                className={`w-full rounded-xl px-3.5 py-2.5 text-sm border transition-colors focus:outline-none ${
                  isLocked
                    ? 'bg-[#060a16] text-slate-200 placeholder-slate-600 border-amber-500/30 cursor-not-allowed focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50'
                    : 'bg-[#070c1a] text-slate-100 placeholder-slate-500 border-slate-800 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500'
                }`}
              />
            </div>

            <div className="space-y-2.5 pt-1">
              <p className="text-xs font-semibold tracking-wider text-slate-300">
                Como foi o seu dia hoje?
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {JOURNAL_MOODS.map(({ label, emoji }) => {
                  const active = mood === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={isLocked}
                      aria-disabled={isLocked}
                      onClick={() => {
                        if (!isLocked) setMood(label);
                      }}
                      className={
                        active
                          ? `px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white border border-indigo-400 shadow-xs transition-all whitespace-nowrap shrink-0 ${
                              isLocked ? 'cursor-not-allowed opacity-85' : 'cursor-pointer'
                            }`
                          : `px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-slate-300 border border-slate-800 transition-all whitespace-nowrap shrink-0 ${
                              isLocked
                                ? 'cursor-not-allowed opacity-50'
                                : 'hover:bg-slate-800 cursor-pointer'
                            }`
                      }
                    >
                      {emoji} {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                disabled={isLocked}
                aria-disabled={isLocked}
                onClick={handleClearCurrentEntry}
                title={
                  isLocked
                    ? 'Desbloqueie no cadeado no canto direito antes de limpar'
                    : 'Apagar o registro deste dia'
                }
                className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  isLocked
                    ? 'text-rose-400/45 border-transparent cursor-not-allowed'
                    : 'text-rose-400 hover:bg-rose-500/10 border-transparent hover:border-rose-500/30 cursor-pointer'
                }`}
              >
                Limpar entrada do dia
              </button>

              {isLocked ? (
                <button
                  type="button"
                  onClick={() => setIsLocked(false)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Entrada protegida · Desbloquear para editar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveCurrentEntry}
                  className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  Salvar entrada do diário
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed right-corner padlock button */}
      {showPadlockControl && (
        <button
          type="button"
          onClick={handleTogglePadlock}
          aria-pressed={!isLocked}
          aria-label={
            isLocked
              ? 'Cadeado fechado: clique para desbloquear e editar o diário'
              : 'Cadeado aberto: clique para salvar e travar o diário'
          }
          className={`fixed right-4 bottom-16 sm:right-6 sm:bottom-6 z-40 min-h-[44px] inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold border shadow-2xl backdrop-blur-md transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
            isLocked
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 focus-visible:ring-amber-300'
              : 'bg-slate-900/95 hover:bg-slate-800 text-emerald-300 border-emerald-500/50 focus-visible:ring-emerald-400'
          }`}
        >
          {isLocked ? (
            <Lock className="w-4 h-4 shrink-0" />
          ) : (
            <Unlock className="w-4 h-4 shrink-0" />
          )}
          <span>
            {isLocked
              ? 'Diário bloqueado · Editar'
              : hasUnsavedChanges || !hasSavedContent
                ? 'Salvar e travar diário'
                : 'Travar diário'}
          </span>
        </button>
      )}
    </section>
  );
}
