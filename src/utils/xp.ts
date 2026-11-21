import type {
  CompletionLog,
  JournalEntry,
  LevelDefinition,
  SkillTierInfo,
  Task,
  Vice,
  XpProgressSummary,
} from '../types/foco';
import { parseDateKey, shiftDateKey } from './date';

export const XP_PER_COMPLETION = 1;
export const XP_PENALTY_ON_FAIL = 0.5;

export interface Last7DaysXpPoint {
  dateKey: string;
  label: string;
  fullDateLabel: string;
  dailyXp: number;
  cumulativeXp: number;
}

export interface DayCloseXpReport {
  missedDailyCount: number;
  missedJournal: boolean;
  cleanViceCount: number;
  gainedXp: number;
  lostXp: number;
  netRawDelta: number;
}

export const LEVEL_DEFINITIONS: LevelDefinition[] = [
  {
    level: 1,
    title: 'Centelha Inicial',
    stage: 'Despertar',
    minXp: 0,
    summary: 'O primeiro movimento para sair da inércia.',
    description:
      'Toda grande mudança começa com uma única ação concluída. Aqui você define suas primeiras habilidades diárias e prova para si mesmo que consegue cumprir o que planejou hoje.',
    milestoneTip: 'Conclua suas 2 primeiras habilidades para alcançar o Nível 2.',
  },
  {
    level: 2,
    title: 'Primeiro Passo',
    stage: 'Despertar',
    minXp: 2,
    summary: 'Você quebrou a resistência inicial.',
    description:
      'As primeiras vitórias mostram que o sistema funciona. Cada +1 XP registrado consolida a confiança de que você consegue manter compromissos simples sem depender de sorte.',
    milestoneTip: 'Mantenha tarefas pequenas e fáceis de iniciar nos dias corridos.',
  },
  {
    level: 3,
    title: 'Aprendiz do Foco',
    stage: 'Despertar',
    minXp: 5,
    summary: 'A atenção começa a encontrar direção fixa.',
    description:
      'Você já percebe quais horários rendem melhor e quais distrações tentam roubar seu tempo. Suas habilidades começam a ganhar repetição real.',
    milestoneTip: 'Use o som ambiente aleatório junto das tarefas que exigem leitura ou silêncio.',
  },
  {
    level: 4,
    title: 'Praticante Constante',
    stage: 'Fundação',
    minXp: 9,
    summary: 'A intenção está se transformando em ritmo.',
    description:
      'Fazer uma vez é fácil; repetir quando a empolgação baixa é o que cria habilidade. Você já soma quase uma dezena de conclusões consistentes no histórico.',
    milestoneTip: 'Observe no calendário de constância os dias mais produtivos da sua semana.',
  },
  {
    level: 5,
    title: 'Construtor de Hábitos',
    stage: 'Fundação',
    minXp: 14,
    summary: 'Os pilares do seu cotidiano estão de pé.',
    description:
      'Suas tarefas diárias já formam um bloco previsível do seu dia. Completar o Combo Diário passa a gerar satisfação imediata em vez de parecer uma obrigação pesada.',
    milestoneTip: 'Tente fechar o Combo Diário completo pelo menos 3 vezes nesta etapa.',
  },
  {
    level: 6,
    title: 'Guardião da Rotina',
    stage: 'Fundação',
    minXp: 21,
    summary: 'Consistência acima da motivação passageira.',
    description:
      'Mesmo nos dias cansativos você entrega o essencial mínimo para não quebrar a corrente. A disciplina começa a proteger o seu tempo de escolhas impulsivas.',
    milestoneTip: 'Registre no diário o que ajudou você a cumprir sua rotina mesmo sem vontade.',
  },
  {
    level: 7,
    title: 'Mente Disciplinada',
    stage: 'Consistência',
    minXp: 30,
    summary: 'Foco resistente às distrações comuns.',
    description:
      'Trinta ações concluídas provam que sua evolução não foi acaso. Você já enxerga claramente a ligação entre cumprir habilidades diárias e manter seus vícios sob controle.',
    milestoneTip: 'Revise suas habilidades únicas e limpe o que já cumpriu seu papel.',
  },
  {
    level: 8,
    title: 'Estrategista Diário',
    stage: 'Consistência',
    minXp: 42,
    summary: 'Domínio prático de prioridade e energia.',
    description:
      'Você não apenas executa tarefas: escolhe melhor o que entra na lista. Sabe dosar esforço sem sobrecarregar o dia e mantém o mapa de calor sempre ativo.',
    milestoneTip: 'Combine uma habilidade difícil logo cedo com uma rápida para ganhar embalo.',
  },
  {
    level: 9,
    title: 'Forja de Ferro',
    stage: 'Consistência',
    minXp: 56,
    summary: 'Resiliência mantida mesmo após dias difíceis.',
    description:
      'Tropeços não derrubam mais sua semana inteira. Você ajusta a rota rápido, aprende com os gatilhos registrados e volta a somar +1 XP no dia seguinte.',
    milestoneTip: 'Releia seus comentários salvos na aba de vícios para antecipar gatilhos.',
  },
  {
    level: 10,
    title: 'Veterano da Clareza',
    stage: 'Domínio',
    minXp: 75,
    summary: 'Autonomia sólida e ritmo sustentável.',
    description:
      'Setenta e cinco conclusões refletem semanas de presença real. Suas habilidades centrais já funcionam quase no piloto automático e exigem menos atrito mental para começar.',
    milestoneTip: 'Escolha uma habilidade-chave para levar até o estágio Mestre (30+ XP).',
  },
  {
    level: 11,
    title: 'Mestre da Execução',
    stage: 'Domínio',
    minXp: 98,
    summary: 'Precisão diária e baixo desperdício de tempo.',
    description:
      'Você transformou metas vagas em entregas concretas com horário marcado. O hábito de iniciar e terminar tarefas virou parte natural da sua postura diária.',
    milestoneTip: 'Acompanhe no filtro por tarefa do heatmap qual habilidade lidera seu mês.',
  },
  {
    level: 12,
    title: 'Sábio da Constância',
    stage: 'Domínio',
    minXp: 125,
    summary: 'Equilíbrio maduro entre esforço, mente e calma.',
    description:
      'Mais de cento e vinte e cinco ações concluídas demonstram maturidade: você sabe quando acelerar, quando descansar e como manter a mente serena sob pressão.',
    milestoneTip: 'Use a gratidão diária para consolidar a clareza emocional dessa fase.',
  },
  {
    level: 13,
    title: 'Arquiteto do Destino',
    stage: 'Maestria',
    minXp: 160,
    summary: 'Seus hábitos já moldam sua identidade.',
    description:
      'Não se trata mais de tentar ser disciplinado — você age com disciplina porque é assim que conduz seus dias. Cada +1 XP aqui reflete refinamento e alto padrão pessoal.',
    milestoneTip: 'Eleve o desafio ajustando suas diárias para refletir seus próximos objetivos de vida.',
  },
  {
    level: 14,
    title: 'Grão-Mestre do Foco',
    stage: 'Maestria',
    minXp: 200,
    summary: 'Excelência contínua e autodomínio raro.',
    description:
      'Duzentas conclusões colocam você em um patamar de constância extraordinário. Você domina atenção, registro emocional e superação de recaídas com serenidade.',
    milestoneTip: 'Faltam apenas 50 conclusões para atingir o ápice da trilha de níveis.',
  },
  {
    level: 15,
    title: 'Lenda Inabalável',
    stage: 'Maestria',
    minXp: 250,
    summary: 'Nível máximo atingido — maestria plena do cotidiano.',
    description:
      'Você completou toda a jornada dos 15 níveis com constância admirável. Mesmo no nível máximo, cada nova habilidade concluída continua somando +1 XP infinito e fortalecendo seu legado diário.',
    milestoneTip: 'Continue acumulando XP e inspirando sua melhor versão todos os dias.',
  },
];

export function roundXp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export function sanitizeTotalXp(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, roundXp(n));
}

export function formatXp(value: number, signed: boolean = false): string {
  const rounded = roundXp(value);
  const absFormatted = Number.isInteger(rounded)
    ? String(Math.abs(rounded))
    : Math.abs(rounded).toFixed(1).replace('.', ',');
  if (rounded < 0) return `-${absFormatted}`;
  if (signed && rounded > 0) return `+${absFormatted}`;
  return absFormatted;
}

export function hasJournalContent(entry: JournalEntry | undefined): boolean {
  if (!entry) return false;
  return Boolean((entry.dump && entry.dump.trim()) || (entry.gratitude && entry.gratitude.trim()));
}

export function applyXpDelta(params: {
  totalXp: number;
  xpByDate: Record<string, number>;
  dateKey: string;
  delta: number;
}): {
  totalXp: number;
  xpByDate: Record<string, number>;
  actualDelta: number;
} {
  const prevTotal = sanitizeTotalXp(params.totalXp);
  const nextTotal = Math.max(0, roundXp(prevTotal + params.delta));
  const actualDelta = roundXp(nextTotal - prevTotal);

  const nextByDate = { ...params.xpByDate };
  if (actualDelta !== 0) {
    const prevDayXp = Number.isFinite(Number(nextByDate[params.dateKey]))
      ? Number(nextByDate[params.dateKey])
      : 0;
    const updatedDayXp = roundXp(prevDayXp + actualDelta);
    if (updatedDayXp === 0) {
      delete nextByDate[params.dateKey];
    } else {
      nextByDate[params.dateKey] = updatedDayXp;
    }
  }

  return {
    totalXp: nextTotal,
    xpByDate: nextByDate,
    actualDelta,
  };
}

export function evaluateDayCloseXp(params: {
  tasks: Task[];
  journalEntries: Record<string, JournalEntry>;
  vices: Vice[];
  closingDateKey: string;
}): DayCloseXpReport {
  const { tasks, journalEntries, vices, closingDateKey } = params;

  const dailyTasks = tasks.filter((t) => t.type === 'daily');
  const missedDailyCount = dailyTasks.filter((t) => !t.completed).length;

  const missedJournal = !hasJournalContent(journalEntries[closingDateKey]);

  const cleanViceCount = vices.filter((v) => {
    const relapsedThatDay = Array.isArray(v.relapses)
      ? v.relapses.some((r) => r.dateKey === closingDateKey)
      : false;
    return !relapsedThatDay;
  }).length;

  const gainedXp = roundXp(cleanViceCount * XP_PER_COMPLETION);
  const lostXp = roundXp(
    (missedDailyCount + (missedJournal ? 1 : 0)) * XP_PENALTY_ON_FAIL
  );
  const netRawDelta = roundXp(gainedXp - lostXp);

  return {
    missedDailyCount,
    missedJournal,
    cleanViceCount,
    gainedXp,
    lostXp,
    netRawDelta,
  };
}

export function getLevelProgress(totalXpInput: number): XpProgressSummary {
  const totalXp = sanitizeTotalXp(totalXpInput);

  let currentIndex = 0;
  for (let i = 0; i < LEVEL_DEFINITIONS.length; i += 1) {
    if (totalXp >= LEVEL_DEFINITIONS[i].minXp) {
      currentIndex = i;
    } else {
      break;
    }
  }

  const currentLevel = LEVEL_DEFINITIONS[currentIndex];
  const nextLevel =
    currentIndex < LEVEL_DEFINITIONS.length - 1 ? LEVEL_DEFINITIONS[currentIndex + 1] : null;

  if (!nextLevel) {
    return {
      totalXp,
      currentLevel,
      nextLevel: null,
      xpIntoCurrentLevel: roundXp(totalXp - currentLevel.minXp),
      xpRequiredForNextLevel: 0,
      xpRemainingToNext: 0,
      progressPercent: 100,
      isMaxLevel: true,
    };
  }

  const span = Math.max(1, nextLevel.minXp - currentLevel.minXp);
  const gained = Math.max(0, roundXp(totalXp - currentLevel.minXp));
  const progressPercent = Math.min(100, Math.max(0, Math.round((gained / span) * 100)));

  return {
    totalXp,
    currentLevel,
    nextLevel,
    xpIntoCurrentLevel: gained,
    xpRequiredForNextLevel: span,
    xpRemainingToNext: Math.max(0, roundXp(nextLevel.minXp - totalXp)),
    progressPercent,
    isMaxLevel: false,
  };
}

export function getSkillTierInfo(completions: number): SkillTierInfo {
  const xp = Math.floor(sanitizeTotalXp(completions));

  if (xp < 3) {
    return {
      xp,
      tierName: 'Iniciante',
      nextTierXp: 3,
      progressPercent: Math.round((xp / 3) * 100),
    };
  }
  if (xp < 7) {
    return {
      xp,
      tierName: 'Praticante',
      nextTierXp: 7,
      progressPercent: Math.round(((xp - 3) / 4) * 100),
    };
  }
  if (xp < 15) {
    return {
      xp,
      tierName: 'Consistente',
      nextTierXp: 15,
      progressPercent: Math.round(((xp - 7) / 8) * 100),
    };
  }
  if (xp < 30) {
    return {
      xp,
      tierName: 'Veterana',
      nextTierXp: 30,
      progressPercent: Math.round(((xp - 15) / 15) * 100),
    };
  }
  return {
    xp,
    tierName: 'Mestre',
    nextTierXp: null,
    progressPercent: 100,
  };
}

export function getDailyComboSummary(tasks: Task[]): {
  completedDaily: number;
  totalDaily: number;
  percent: number;
  isAllDailyDone: boolean;
} {
  const dailyTasks = tasks.filter((t) => t.type === 'daily');
  const totalDaily = dailyTasks.length;
  const completedDaily = dailyTasks.filter((t) => t.completed).length;
  const percent = totalDaily > 0 ? Math.round((completedDaily / totalDaily) * 100) : 0;

  return {
    completedDaily,
    totalDaily,
    percent,
    isAllDailyDone: totalDaily > 0 && completedDaily === totalDaily,
  };
}

export function getTodayXpEarned(
  tasks: Task[],
  completionLogs: CompletionLog[],
  todayKey: string,
  xpByDate?: Record<string, number>
): { xpToday: number; completedTodayCount: number } {
  const logCountToday = completionLogs.filter((log) => log.dateKey === todayKey).length;
  const completedTasksTodayCount = tasks.filter(
    (t) => t.completed && t.completedDate === todayKey
  ).length;
  const completedTodayCount = Math.max(logCountToday, completedTasksTodayCount);

  if (xpByDate && Object.prototype.hasOwnProperty.call(xpByDate, todayKey)) {
    const val = Number(xpByDate[todayKey]);
    return {
      xpToday: Number.isFinite(val) ? roundXp(val) : completedTodayCount * XP_PER_COMPLETION,
      completedTodayCount,
    };
  }

  return {
    xpToday: completedTodayCount * XP_PER_COMPLETION,
    completedTodayCount,
  };
}

export function getLast7DaysXpSeries(params: {
  tasks: Task[];
  completionLogs: CompletionLog[];
  totalXp: number;
  todayKey: string;
  xpByDate?: Record<string, number>;
}): Last7DaysXpPoint[] {
  const { tasks, completionLogs, totalXp, todayKey, xpByDate } = params;
  const safeTotalXp = sanitizeTotalXp(totalXp);

  const countByDay: Record<string, number> = {};
  completionLogs.forEach((log) => {
    countByDay[log.dateKey] = (countByDay[log.dateKey] || 0) + 1;
  });

  const completedTasksTodayCount = tasks.filter(
    (t) => t.completed && t.completedDate === todayKey
  ).length;
  countByDay[todayKey] = Math.max(countByDay[todayKey] || 0, completedTasksTodayCount);

  const days: { dateKey: string; dailyXp: number }[] = [];
  let xpNetInWindow = 0;

  for (let offset = -6; offset <= 0; offset += 1) {
    const dateKey = shiftDateKey(todayKey, offset);
    let dailyXp: number;
    if (xpByDate && Object.prototype.hasOwnProperty.call(xpByDate, dateKey)) {
      const stored = Number(xpByDate[dateKey]);
      dailyXp = Number.isFinite(stored) ? roundXp(stored) : 0;
    } else if (xpByDate && Object.keys(xpByDate).length > 0) {
      dailyXp = 0;
    } else {
      dailyXp = (countByDay[dateKey] || 0) * XP_PER_COMPLETION;
    }
    xpNetInWindow = roundXp(xpNetInWindow + dailyXp);
    days.push({ dateKey, dailyXp });
  }

  let runningXp = Math.max(0, roundXp(safeTotalXp - xpNetInWindow));

  return days.map(({ dateKey, dailyXp }, idx) => {
    runningXp = Math.max(0, roundXp(runningXp + dailyXp));
    const dt = parseDateKey(dateKey);
    const shortDate = dt
      .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
      .replace('.', '');
    const weekday = dt
      .toLocaleDateString('pt-BR', { weekday: 'short' })
      .replace('.', '');
    const isToday = idx === days.length - 1;

    return {
      dateKey,
      label: isToday ? 'Hoje' : shortDate,
      fullDateLabel: `${weekday}, ${shortDate}`,
      dailyXp,
      cumulativeXp: runningXp,
    };
  });
}
