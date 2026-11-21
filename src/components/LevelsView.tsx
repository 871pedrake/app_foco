import { useMemo, useState } from 'react';
import { Award, CheckCircle2, Lock, Sparkles, TrendingUp, Zap } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CompletionLog, Task } from '../types/foco';
import {
  LEVEL_DEFINITIONS,
  type Last7DaysXpPoint,
  formatXp,
  getDailyComboSummary,
  getLast7DaysXpSeries,
  getLevelProgress,
  getSkillTierInfo,
  getTodayXpEarned,
} from '../utils/xp';

interface LevelsViewProps {
  tasks: Task[];
  completionLogs: CompletionLog[];
  totalXp: number;
  xpByDate: Record<string, number>;
  todayKey: string;
  onGoToTasks: () => void;
  onResetXp?: () => void;
}

type RoadmapFilter = 'all' | 'unlocked' | 'upcoming';

interface XpTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Last7DaysXpPoint }>;
}

function CustomXpTooltip({ active, payload }: XpTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-lg px-3.5 py-2.5 text-xs space-y-1">
      <p className="font-semibold text-slate-900 dark:text-white capitalize">
        {point.fullDateLabel}
      </p>
      <p className="text-indigo-600 dark:text-indigo-400 font-bold font-mono tabular-nums">
        {formatXp(point.cumulativeXp)} XP acumulados
      </p>
      <p
        className={`text-[11px] tabular-nums ${
          point.dailyXp < 0
            ? 'text-rose-500 dark:text-rose-400 font-medium'
            : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {point.dailyXp > 0
          ? `+${formatXp(point.dailyXp)} XP de saldo neste dia`
          : point.dailyXp < 0
          ? `${formatXp(point.dailyXp)} XP perdido neste dia`
          : 'Saldo neutro neste dia'}
      </p>
    </div>
  );
}

export function LevelsView({
  tasks,
  completionLogs,
  totalXp,
  xpByDate,
  todayKey,
  onGoToTasks,
  onResetXp,
}: LevelsViewProps) {
  const [roadmapFilter, setRoadmapFilter] = useState<RoadmapFilter>('all');
  const [confirmingReset, setConfirmingReset] = useState(false);

  const xpSummary = useMemo(() => getLevelProgress(totalXp), [totalXp]);
  const combo = useMemo(() => getDailyComboSummary(tasks), [tasks]);
  const todayStats = useMemo(
    () => getTodayXpEarned(tasks, completionLogs, todayKey, xpByDate),
    [tasks, completionLogs, todayKey, xpByDate]
  );

  const xpSeries7Days = useMemo(
    () =>
      getLast7DaysXpSeries({
        tasks,
        completionLogs,
        totalXp,
        todayKey,
        xpByDate,
      }),
    [tasks, completionLogs, totalXp, todayKey, xpByDate]
  );

  const chartStats = useMemo(() => {
    const vals = xpSeries7Days.map((d) => d.cumulativeXp);
    const minVal = vals.length > 0 ? Math.min(...vals) : 0;
    const maxVal = vals.length > 0 ? Math.max(...vals) : 0;
    const span = maxVal - minVal;
    const yMin = minVal === 0 ? 0 : Math.max(0, Math.floor(minVal - Math.max(1, span * 0.25)));
    const yMax = Math.max(yMin + 3, Math.ceil(maxVal + Math.max(1, span * 0.15)));
    const xpGained7Days = xpSeries7Days.reduce((acc, d) => acc + d.dailyXp, 0);
    return { yMin, yMax, xpGained7Days };
  }, [xpSeries7Days]);

  const rankedSkills = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (b.completions !== a.completions) return b.completions - a.completions;
      return b.createdAt - a.createdAt;
    });
  }, [tasks]);

  const unlockedCount = useMemo(
    () => LEVEL_DEFINITIONS.filter((lvl) => xpSummary.totalXp >= lvl.minXp).length,
    [xpSummary.totalXp]
  );

  const filteredLevels = useMemo(() => {
    if (roadmapFilter === 'unlocked') {
      return LEVEL_DEFINITIONS.filter((lvl) => xpSummary.totalXp >= lvl.minXp);
    }
    if (roadmapFilter === 'upcoming') {
      return LEVEL_DEFINITIONS.filter((lvl) => xpSummary.totalXp < lvl.minXp);
    }
    return LEVEL_DEFINITIONS;
  }, [roadmapFilter, xpSummary.totalXp]);

  return (
    <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Top Hero Overview */}
      <section className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 p-5 sm:p-7 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              <span>Estágio: {xpSummary.currentLevel.stage}</span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span className="tabular-nums">
                +1 XP (tarefas, diário e vícios limpos) · -0,5 XP se falhar
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance">
              Nível {xpSummary.currentLevel.level}: {xpSummary.currentLevel.title}
            </h2>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {xpSummary.currentLevel.description}
            </p>
          </div>

          <div className="w-full lg:w-[380px] shrink-0 rounded-xl bg-slate-50 dark:bg-slate-950/75 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                {xpSummary.isMaxLevel
                  ? 'Nível Máximo Alcançado'
                  : `Rumo ao Nível ${xpSummary.nextLevel?.level} (${xpSummary.nextLevel?.title})`}
              </span>
              <span className="font-mono font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
                {xpSummary.progressPercent}%
              </span>
            </div>

            <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300"
                style={{ width: `${xpSummary.progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {xpSummary.isMaxLevel ? (
                <span>{formatXp(xpSummary.totalXp)} XP acumulados no total</span>
              ) : (
                <>
                  <span>
                    {formatXp(xpSummary.xpIntoCurrentLevel)} / {xpSummary.xpRequiredForNextLevel} XP nesta etapa
                  </span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    Falta {formatXp(xpSummary.xpRemainingToNext)} XP
                  </span>
                </>
              )}
            </div>

            {onResetXp && xpSummary.totalXp > 0 && (
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                {!confirmingReset ? (
                  <>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      Quer começar a contagem do zero?
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmingReset(true)}
                      className="text-[11px] font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 cursor-pointer whitespace-nowrap"
                    >
                      Zerar XP
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] font-medium text-rose-600 dark:text-rose-300">
                      Voltar para 0 XP (Nível 1)?
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingReset(false);
                          onResetXp();
                        }}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer whitespace-nowrap"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingReset(false)}
                        className="px-2 py-1 rounded-md text-[11px] font-medium bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 4 Summary Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
          <div className="rounded-xl bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 p-3.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">XP Total</p>
            <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5 tabular-nums">
              {formatXp(xpSummary.totalXp)} XP
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              habilidades, diário e vícios
            </p>
          </div>

          <div className="rounded-xl bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 p-3.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Saldo de XP Hoje</p>
            <p
              className={`text-2xl font-extrabold mt-0.5 tabular-nums ${
                todayStats.xpToday < 0
                  ? 'text-rose-500 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {todayStats.xpToday >= 0
                ? `+${formatXp(todayStats.xpToday)} XP`
                : `${formatXp(todayStats.xpToday)} XP`}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {todayStats.completedTodayCount}{' '}
              {todayStats.completedTodayCount === 1 ? 'habilidade concluída' : 'habilidades concluídas'}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 p-3.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Combo Diário</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">
              {combo.completedDaily}/{combo.totalDaily}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {combo.totalDaily === 0
                ? 'sem habilidades diárias ainda'
                : combo.isAllDailyDone
                ? 'combo completo hoje'
                : `${combo.percent}% das diárias concluídas`}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 p-3.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Patentes Desbloqueadas</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">
              {unlockedCount}/15
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              trilha completa de 15 níveis
            </p>
          </div>
        </div>
      </section>

      {/* 7-Day Cumulative XP Line Chart (Recharts) */}
      <section className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Evolução do XP Acumulado (Últimos 7 dias)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Inclui ganhos (+1 XP em habilidades, diário e vícios limpos) e perdas (-0,5 XP ao falhar).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
            <span
              className={`font-mono font-bold ${
                chartStats.xpGained7Days < 0
                  ? 'text-rose-500 dark:text-rose-400'
                  : 'text-indigo-600 dark:text-indigo-400'
              }`}
            >
              {chartStats.xpGained7Days >= 0
                ? `+${formatXp(chartStats.xpGained7Days)}`
                : formatXp(chartStats.xpGained7Days)}{' '}
              XP nos últimos 7 dias
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <span>Total atual: {formatXp(xpSummary.totalXp)} XP</span>
          </div>
        </div>

        <div className="h-64 w-full" aria-label="Gráfico de linha de XP acumulado nos últimos 7 dias">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={xpSeries7Days} margin={{ top: 10, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(148, 163, 184, 0.22)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                dy={6}
              />
              <YAxis
                allowDecimals={true}
                domain={[chartStats.yMin, chartStats.yMax]}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip
                content={<CustomXpTooltip />}
                cursor={{ stroke: 'rgba(99, 102, 241, 0.35)', strokeWidth: 1.5 }}
              />
              <Line
                type="monotone"
                dataKey="cumulativeXp"
                name="XP Acumulado"
                stroke="#6366f1"
                strokeWidth={2.75}
                dot={{ r: 4, fill: '#6366f1', stroke: '#ffffff', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#4f46e5', stroke: '#ffffff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Main 2-Column Content: Per-Skill XP + 15 Detailed Levels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: XP Próprio de Cada Habilidade */}
        <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800/80 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                XP de Cada Habilidade
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Toda conclusão soma +1 XP no nível geral e na própria habilidade.
              </p>
            </div>
            <span className="text-xs font-mono font-semibold tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
              {rankedSkills.length} {rankedSkills.length === 1 ? 'item' : 'itens'}
            </span>
          </div>

          {rankedSkills.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Nenhuma habilidade cadastrada ainda
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Adicione suas primeiras tarefas diárias ou únicas para começar a acumular +1 XP em cada uma.
              </p>
              <button
                type="button"
                onClick={onGoToTasks}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
              >
                Ir para Tarefas &amp; Histórico
              </button>
            </div>
          ) : (
            <ul className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
              {rankedSkills.map((task) => {
                const skillTier = getSkillTierInfo(task.completions);
                return (
                  <li
                    key={task.id}
                    className="rounded-xl bg-slate-50/90 dark:bg-slate-950/65 border border-slate-200/70 dark:border-slate-800/80 p-3.5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {task.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <span>{task.type === 'daily' ? 'Diária' : 'Única'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-indigo-600 dark:text-indigo-400">
                            {skillTier.tierName}
                          </span>
                          {task.completed && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                Feita hoje
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 tabular-nums">
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                          {skillTier.xp} XP
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400 transition-all duration-300"
                          style={{ width: `${skillTier.progressPercent}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {skillTier.nextTierXp !== null
                          ? `Próximo estágio da habilidade em ${skillTier.nextTierXp} XP (faltam ${
                              skillTier.nextTierXp - skillTier.xp
                            } XP)`
                          : 'Maestria máxima desta habilidade alcançada'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Right: Trilha dos 15 Níveis Detalhados */}
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800/80 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Os 15 Níveis Detalhados
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Cada nível marca um novo patamar de consistência construído de +1 em +1 XP.
              </p>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setRoadmapFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  roadmapFilter === 'all'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Todos (15)
              </button>
              <button
                type="button"
                onClick={() => setRoadmapFilter('unlocked')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  roadmapFilter === 'unlocked'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Desbloqueados ({unlockedCount})
              </button>
              <button
                type="button"
                onClick={() => setRoadmapFilter('upcoming')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  roadmapFilter === 'upcoming'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Próximos ({15 - unlockedCount})
              </button>
            </div>
          </div>

          {filteredLevels.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Award className="w-6 h-6 text-emerald-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Você já desbloqueou todos os 15 níveis!
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Continue concluindo suas habilidades diárias para seguir acumulando XP infinito.
              </p>
            </div>
          ) : (
            <ol className="space-y-3">
              {filteredLevels.map((lvl) => {
                const isCurrent = lvl.level === xpSummary.currentLevel.level;
                const isUnlocked = xpSummary.totalXp >= lvl.minXp;
                const xpMissing = Math.max(0, lvl.minXp - xpSummary.totalXp);

                return (
                  <li
                    key={lvl.level}
                    className={`rounded-xl border p-4 space-y-2.5 transition-colors ${
                      isCurrent
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/35 border-indigo-400/70 dark:border-indigo-500/60'
                        : isUnlocked
                        ? 'bg-slate-50/80 dark:bg-slate-950/55 border-emerald-500/30 dark:border-emerald-500/25'
                        : 'bg-slate-50/40 dark:bg-slate-950/30 border-slate-200/70 dark:border-slate-800/70 opacity-90'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono tabular-nums shrink-0 ${
                            isCurrent
                              ? 'bg-indigo-600 text-white'
                              : isUnlocked
                              ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-200/80 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {lvl.level}
                        </span>

                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {lvl.title}
                          </h4>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>{lvl.stage}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums font-medium">
                              Requisito: {lvl.minXp} XP
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-semibold shrink-0">
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                            <Zap className="w-3.5 h-3.5" />
                            <span>Nível Atual</span>
                          </span>
                        ) : isUnlocked ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Conquistado</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 tabular-nums">
                            <Lock className="w-3.5 h-3.5" />
                            <span>Faltam {formatXp(xpMissing)} XP</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      {lvl.summary}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {lvl.description}
                    </p>

                    <div className="flex items-start gap-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-800/70 text-[11px] text-slate-500 dark:text-slate-400">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                      <span>{lvl.milestoneTip}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
