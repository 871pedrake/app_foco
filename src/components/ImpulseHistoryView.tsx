import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Clock, Rocket, Trash2, Wind } from 'lucide-react';
import type { ImpulseLog } from '../types/foco';
import { formatFullPtDate, getLocalTodayKey } from '../utils/date';

interface ImpulseHistoryViewProps {
  logs: ImpulseLog[];
  todayKey?: string;
  onTriggerImpulse: () => void;
  onDeleteLog: (logId: string) => void;
}

export function ImpulseHistoryView({
  logs,
  todayKey: todayKeyProp,
  onTriggerImpulse,
  onDeleteLog,
}: ImpulseHistoryViewProps) {
  const [launching, setLaunching] = useState(false);
  const launchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (launchTimerRef.current) {
        clearTimeout(launchTimerRef.current);
      }
    };
  }, []);

  const todayKey = todayKeyProp || getLocalTodayKey();
  const todayCount = logs.filter((l) => l.dateKey === todayKey).length;
  const completedCount = logs.filter((l) => l.completedExercise).length;

  return (
    <section className="flex-1 w-full max-w-[1120px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 shadow-sm p-5 sm:p-7 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-orange-600 dark:text-orange-400">
              Sem pontos ou XP · Registro pessoal para quebrar a inércia do vício
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-0.5">
              Histórico do <span className="text-orange-500">Impulso</span>
            </h2>
          </div>

          <motion.button
            type="button"
            data-no-click-sound="true"
            onClick={() => {
              setLaunching(true);
              if (launchTimerRef.current) {
                clearTimeout(launchTimerRef.current);
              }
              launchTimerRef.current = setTimeout(() => {
                setLaunching(false);
                launchTimerRef.current = null;
              }, 520);
              onTriggerImpulse();
            }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:brightness-105 text-white shadow-md shadow-orange-500/25 transition-all cursor-pointer"
          >
            <motion.span
              aria-hidden="true"
              animate={
                launching
                  ? {
                      x: [0, -1, 12, 0],
                      y: [0, 1, -14, 0],
                      rotate: [0, -8, 16, 0],
                      scale: [1, 0.9, 1.2, 1],
                    }
                  : { x: 0, y: 0, rotate: 0, scale: 1 }
              }
              transition={{ duration: 0.48, ease: 'easeOut' }}
              className="inline-flex items-center justify-center"
            >
              <Rocket className="w-4 h-4" />
            </motion.span>
            <span>Acionar Impulso agora</span>
          </motion.button>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-4 transition-transform hover:-translate-y-0.5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Impulsos registrados
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums mt-1">
              {logs.length}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-4 transition-transform hover:-translate-y-0.5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Freios hoje
            </div>
            <div className="text-2xl font-black text-orange-600 dark:text-orange-400 tabular-nums mt-1">
              {todayCount}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-4 transition-transform hover:-translate-y-0.5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Quebras de inércia concluídas
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
              {completedCount}
            </div>
          </div>
        </div>

        {/* Timeline List */}
        {logs.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-dashed border-slate-300 dark:border-slate-800 p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-white flex items-center justify-center mx-auto shadow-md shadow-orange-500/20">
              <Rocket className="w-5 h-5" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Nenhum impulso registrado ainda
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Sempre que sentir vontade de fazer alguma besteira ou cair em um vício, clique no botão redondo de foguete no meio da barra superior. O que você escrever ficará guardado aqui com data e hora — sem alterar seu XP.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {logs.map((log, idx) => (
                <motion.li
                  layout
                  key={log.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16, scale: 0.97 }}
                  transition={{ duration: 0.22, delay: Math.min(idx * 0.03, 0.2) }}
                  className="rounded-2xl bg-slate-50/90 dark:bg-slate-950/65 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 space-y-2.5"
                >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 capitalize">
                    <Clock className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <span>{formatFullPtDate(log.dateKey)}</span>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="font-mono tabular-nums text-orange-600 dark:text-orange-400">
                      às {log.timeStr}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="normal-case text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      0 XP (sem pontuação)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteLog(log.id)}
                    aria-label="Excluir registro de impulso"
                    title="Excluir registro"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
                  “{log.thought}”
                </p>

                <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                  {log.completedExercise ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Inércia quebrada: {log.actionTaken}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400">
                      <Wind className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {log.actionTaken
                          ? `Ação sugerida: ${log.actionTaken}`
                          : 'Registro salvo'}
                      </span>
                    </span>
                  )}
                </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  );
}
