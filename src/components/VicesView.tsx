import { useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import {
  RELAPSE_ACTION_PLANS,
  RELAPSE_TRIGGERS,
  type SlipReflectionState,
  type Vice,
} from '../types/foco';
import { formatFullPtDate, getLocalTodayKey, parseDateKey } from '../utils/date';

interface VicesViewProps {
  vices: Vice[];
  todayKey?: string;
  onAddVice: (name: string, initialCleanDays: number) => void;
  onDeleteVice: (viceId: string) => void;
  onRecordRelapse: (viceId: string, trigger: string, comment?: string) => string;
  onSaveSlipReflection: (
    viceId: string,
    logId: string,
    trigger: string,
    context: string,
    plan: string
  ) => void;
  onUpdateRelapseComment: (viceId: string, logId: string, comment: string) => void;
}

export function getViceCleanDays(vice: Vice, todayKey: string = getLocalTodayKey()): number {
  if (!vice || !vice.streakStartKey) return 0;
  const startDt = parseDateKey(vice.streakStartKey);
  const nowDt = parseDateKey(todayKey);
  const diffDays = Math.floor((nowDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export function getViceBestDays(vice: Vice, todayKey: string = getLocalTodayKey()): number {
  const current = getViceCleanDays(vice, todayKey);
  const savedBest = Number.isFinite(Number(vice.bestStreak)) ? Number(vice.bestStreak) : 0;
  return Math.max(current, savedBest);
}

export function VicesView({
  vices,
  todayKey: todayKeyProp,
  onAddVice,
  onDeleteVice,
  onRecordRelapse,
  onSaveSlipReflection,
  onUpdateRelapseComment,
}: VicesViewProps) {
  const todayKey = todayKeyProp || getLocalTodayKey();
  const [focusedViceId, setFocusedViceId] = useState<string | null>(vices[0]?.id ?? null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newInitialDays, setNewInitialDays] = useState('0');

  const [confirmingRelapseViceId, setConfirmingRelapseViceId] = useState<string | null>(null);
  const [selectedRelapseTrigger, setSelectedRelapseTrigger] = useState<string>('Tédio');
  const [showRelapseCommentBox, setShowRelapseCommentBox] = useState(false);
  const [relapseCommentDraft, setRelapseCommentDraft] = useState('');

  const [slipReflection, setSlipReflection] = useState<SlipReflectionState | null>(null);
  const [slipContext, setSlipContext] = useState('');

  const [historyOpen, setHistoryOpen] = useState(true);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState('');

  const effectiveFocusedId =
    focusedViceId && vices.some((v) => v.id === focusedViceId) ? focusedViceId : vices[0]?.id ?? null;
  const focusedVice = vices.find((v) => v.id === effectiveFocusedId) || null;
  const otherVices = focusedVice ? vices.filter((v) => v.id !== focusedVice.id) : [];

  const totalCleanDays = vices.reduce((acc, v) => acc + getViceCleanDays(v, todayKey), 0);

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = newName.trim();
    if (!clean) return;
    const parsed = Number(newInitialDays);
    const days = Number.isFinite(parsed) ? Math.min(3650, Math.max(0, Math.floor(parsed))) : 0;
    onAddVice(clean, days);
    setNewName('');
    setNewInitialDays('0');
    setShowNewForm(false);
  }

  return (
    <section className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="rounded-3xl bg-[#070b19] text-slate-100 border border-indigo-950/90 shadow-2xl p-5 sm:p-7 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-slate-400">
              Monitore e vença seus vícios · +1 XP por dia limpo · -0,5 XP se recair
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-0.5">
              Seus <span className="text-indigo-400">vícios</span>
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-semibold text-indigo-300 tabular-nums">
              {totalCleanDays} dias limpos no total
            </span>
            <button
              type="button"
              onClick={() => setShowNewForm((prev) => !prev)}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all cursor-pointer"
            >
              + Rastrear novo vício
            </button>
          </div>
        </div>

        {showNewForm && (
          <form
            onSubmit={handleAddSubmit}
            className="rounded-2xl bg-[#0c142b] border border-indigo-500/30 p-4 sm:p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Novo vício para rastrear</h3>
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Ver vídeo curto por mais de 10 min"
                className="sm:col-span-2 rounded-xl bg-[#070c1a] text-white placeholder-slate-500 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 px-3.5 py-2.5 text-sm"
              />
              <input
                type="number"
                min={0}
                max={3650}
                value={newInitialDays}
                onChange={(e) => setNewInitialDays(e.target.value)}
                placeholder="Dias limpos atuais"
                className="rounded-xl bg-[#070c1a] text-white placeholder-slate-500 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 px-3.5 py-2.5 text-sm tabular-nums"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
              >
                Adicionar ao rastreamento
              </button>
            </div>
          </form>
        )}

        {/* Post-Relapse Reflection Card */}
        {slipReflection && (
          <div className="rounded-2xl bg-[#0b1228] border border-indigo-500/35 p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Tropeço registrado</h3>
                <p className="text-xs text-slate-400">Acontece. O que conta é a volta.</p>
              </div>
              <button
                type="button"
                aria-label="Fechar reflexão"
                onClick={() => setSlipReflection(null)}
                className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-wider text-slate-400">
                O que aconteceu?
              </p>
              <div className="flex flex-wrap gap-2">
                {RELAPSE_TRIGGERS.map((trig) => {
                  const active = slipReflection.trigger === trig;
                  return (
                    <button
                      key={trig}
                      type="button"
                      onClick={() =>
                        setSlipReflection((prev) => (prev ? { ...prev, trigger: trig } : null))
                      }
                      className={
                        active
                          ? 'px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white border border-indigo-400 cursor-pointer'
                          : 'px-3.5 py-1.5 rounded-xl text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer'
                      }
                    >
                      {trig}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="slip-context-input"
                className="block text-[11px] font-semibold tracking-wider text-slate-400"
              >
                Comentário · fica salvo para você reler quando precisar
              </label>
              <textarea
                id="slip-context-input"
                rows={3}
                value={slipContext}
                onChange={(e) => setSlipContext(e.target.value)}
                placeholder="O que veio antes, onde você estava, o que sentiu..."
                className="w-full rounded-xl bg-[#070c1a] text-slate-100 placeholder-slate-500 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 px-3.5 py-2.5 text-sm resize-y"
              />
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-wider text-slate-400">
                Se acontecer de novo, então eu...
              </p>
              <div className="flex flex-wrap gap-2">
                {RELAPSE_ACTION_PLANS.map((plan) => {
                  const active = slipReflection.plan === plan;
                  return (
                    <button
                      key={plan}
                      type="button"
                      onClick={() =>
                        setSlipReflection((prev) =>
                          prev ? { ...prev, plan: prev.plan === plan ? '' : plan } : null
                        )
                      }
                      className={
                        active
                          ? 'px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white border border-indigo-400 cursor-pointer'
                          : 'px-3.5 py-1.5 rounded-xl text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer'
                      }
                    >
                      {plan}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSlipReflection(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => {
                  onSaveSlipReflection(
                    slipReflection.viceId,
                    slipReflection.logId,
                    slipReflection.trigger,
                    slipContext.trim(),
                    slipReflection.plan
                  );
                  setSlipReflection(null);
                  setSlipContext('');
                  setHistoryOpen(true);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
              >
                Salvar e concluir
              </button>
            </div>
          </div>
        )}

        {/* Focused Vice Card */}
        {!focusedVice ? (
          <div className="rounded-2xl bg-[#0b1228] border border-slate-800 p-8 text-center space-y-2">
            <p className="text-sm font-semibold text-white">Nenhum vício rastreado ainda</p>
            <p className="text-xs text-slate-400">
              Clique em &quot;+ Rastrear novo vício&quot; para começar a acompanhar seus dias limpos.
            </p>
          </div>
        ) : (
          (() => {
            const cleanDays = getViceCleanDays(focusedVice, todayKey);
            const bestDays = getViceBestDays(focusedVice, todayKey);
            const relapseCount = focusedVice.relapses.length;
            const isConfirming = confirmingRelapseViceId === focusedVice.id;

            return (
              <div className="rounded-2xl bg-[#0b1228] border border-indigo-900/70 p-5 sm:p-6 space-y-6">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-bold tracking-wider text-indigo-400">
                      Em foco
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-emerald-300 tabular-nums">
                        Limpo · Dia {cleanDays}
                      </span>
                      <button
                        type="button"
                        title="Excluir vício"
                        aria-label={`Excluir vício ${focusedVice.name}`}
                        onClick={() => {
                          if (slipReflection?.viceId === focusedVice.id) {
                            setSlipReflection(null);
                          }
                          if (confirmingRelapseViceId === focusedVice.id) {
                            setConfirmingRelapseViceId(null);
                          }
                          setEditingLogId(null);
                          onDeleteVice(focusedVice.id);
                        }}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-800 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div className="lg:col-span-7">
                      <h3 className="text-lg sm:text-xl font-bold text-white leading-snug">
                        {focusedVice.name}
                      </h3>
                      <div className="mt-3">
                        <div className="text-5xl sm:text-6xl font-black tracking-tight text-white tabular-nums">
                          {cleanDays}
                        </div>
                        <div className="text-xs font-bold tracking-wider text-slate-400 mt-1">
                          Dias limpos
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400 tabular-nums">
                        <span>
                          Melhor sequência: <strong className="text-white">{bestDays} dias</strong>
                        </span>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setHistoryOpen((prev) => !prev)}
                          className="text-indigo-300 hover:text-indigo-200 underline underline-offset-2 cursor-pointer"
                        >
                          {relapseCount}{' '}
                          {relapseCount === 1 ? 'recaída registrada' : 'recaídas registradas'}
                        </button>
                      </div>

                      {isConfirming ? (
                        <div className="rounded-2xl bg-rose-950/25 border border-rose-500/35 p-4 space-y-3 mt-4">
                          <p className="text-xs font-bold text-white">Qual foi o gatilho?</p>
                          <div className="flex flex-wrap gap-2">
                            {RELAPSE_TRIGGERS.map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setSelectedRelapseTrigger(t)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                                  selectedRelapseTrigger === t
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                                }`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>

                          {/* Explicit "Comentário" button + saved comment textarea */}
                          <div className="pt-1 space-y-2">
                            <button
                              type="button"
                              onClick={() => setShowRelapseCommentBox((prev) => !prev)}
                              aria-expanded={showRelapseCommentBox}
                              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                                showRelapseCommentBox || relapseCommentDraft.trim()
                                  ? 'bg-indigo-600/25 text-indigo-200 border-indigo-400/50'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                              }`}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Comentário</span>
                            </button>

                            {showRelapseCommentBox && (
                              <div className="space-y-1.5">
                                <label
                                  htmlFor="relapse-comment-input"
                                  className="block text-[11px] text-slate-300"
                                >
                                  Escreva o que aconteceu para ficar salvo e você ler depois:
                                </label>
                                <textarea
                                  id="relapse-comment-input"
                                  rows={3}
                                  autoFocus
                                  value={relapseCommentDraft}
                                  onChange={(e) => setRelapseCommentDraft(e.target.value)}
                                  placeholder="Ex.: Fiquei entediado à noite e peguei o celular sem perceber..."
                                  className="w-full rounded-xl bg-[#070c1a] text-slate-100 placeholder-slate-500 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 px-3.5 py-2.5 text-sm resize-y"
                                />
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmingRelapseViceId(null);
                                setShowRelapseCommentBox(false);
                                setRelapseCommentDraft('');
                              }}
                              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const savedDraft = relapseCommentDraft.trim();
                                const logId = onRecordRelapse(
                                  focusedVice.id,
                                  selectedRelapseTrigger,
                                  savedDraft
                                );
                                setConfirmingRelapseViceId(null);
                                setShowRelapseCommentBox(false);
                                setRelapseCommentDraft('');
                                setSlipContext(savedDraft);
                                setHistoryOpen(true);
                                setSlipReflection({
                                  viceId: focusedVice.id,
                                  logId,
                                  trigger: selectedRelapseTrigger,
                                  plan: '',
                                });
                              }}
                              className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-500/40 cursor-pointer"
                            >
                              Confirmar recaída
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Confirmando, o contador <strong className="text-slate-200">volta pra zero</strong>, você perde{' '}
                            <strong className="text-rose-300">-0,5 XP</strong> (e não recebe o +1 XP deste vício hoje), mas a melhor sequência de{' '}
                            <strong className="text-slate-200">{bestDays} dias</strong> continua guardada junto com seu comentário.
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmingRelapseViceId(focusedVice.id);
                            setSelectedRelapseTrigger('Tédio');
                            setShowRelapseCommentBox(false);
                            setRelapseCommentDraft('');
                          }}
                          className="w-full mt-4 py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-rose-950/35 hover:bg-rose-950/60 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer flex items-center justify-center gap-2"
                        >
                          Registrar recaída
                        </button>
                      )}
                    </div>

                    <div className="lg:col-span-5 rounded-2xl bg-[#090f21] border border-slate-800/90 p-4 space-y-3">
                      <p className="text-[11px] font-bold tracking-wider text-slate-400">Marcos</p>
                      <div className="space-y-2.5">
                        {[7, 30, 100].map((m) => {
                          const reached = cleanDays >= m;
                          return (
                            <div
                              key={m}
                              className={`flex items-center justify-between px-4 py-3 rounded-xl border tabular-nums ${
                                reached
                                  ? 'bg-indigo-950/75 border-indigo-500/50 text-indigo-200'
                                  : 'bg-[#070c1a] border-slate-800/80 text-slate-400'
                              }`}
                            >
                              <span className="text-xs font-semibold">{m} dias</span>
                              <span
                                className={`text-[11px] font-semibold ${
                                  reached ? 'text-emerald-400' : 'text-slate-500'
                                }`}
                              >
                                {reached ? 'Concluído' : `${Math.max(0, m - cleanDays)}d restantes`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Saved Relapses & Comments History */}
                <div className="pt-4 border-t border-slate-800/80 space-y-3">
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs sm:text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                        Histórico de quando errei e comentários salvos ({relapseCount})
                      </span>
                    </div>
                    {historyOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {historyOpen && (
                    <div className="space-y-2.5">
                      {focusedVice.relapses.length === 0 ? (
                        <p className="text-xs text-slate-400 py-2">
                          Nenhuma recaída registrada neste vício ainda. Quando você registrar uma recaída e escrever um comentário, a data e o texto ficarão salvos aqui para você reler.
                        </p>
                      ) : (
                        <ul className="space-y-2.5">
                          {focusedVice.relapses.map((relapse) => {
                            const isEditingThis = editingLogId === relapse.id;
                            return (
                              <li
                                key={relapse.id}
                                className="rounded-xl bg-[#070c1a] border border-slate-800/90 p-3.5 space-y-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <div className="flex flex-wrap items-center gap-2 text-slate-200 font-semibold capitalize">
                                    <span>{formatFullPtDate(relapse.dateKey)}</span>
                                    {relapse.timeStr && (
                                      <>
                                        <span aria-hidden="true" className="text-slate-600">·</span>
                                        <span className="font-mono tabular-nums text-indigo-300">
                                          às {relapse.timeStr}
                                        </span>
                                      </>
                                    )}
                                    <span aria-hidden="true" className="text-slate-600">·</span>
                                    <span className="text-rose-300">Gatilho: {relapse.trigger}</span>
                                  </div>

                                  {!isEditingThis && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingLogId(relapse.id);
                                        setEditingCommentDraft(relapse.context || '');
                                      }}
                                      className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-300 hover:text-indigo-200 cursor-pointer"
                                    >
                                      <Pencil className="w-3 h-3" />
                                      <span>
                                        {relapse.context ? 'Editar comentário' : 'Adicionar comentário'}
                                      </span>
                                    </button>
                                  )}
                                </div>

                                {isEditingThis ? (
                                  <div className="space-y-2 pt-1">
                                    <textarea
                                      rows={3}
                                      autoFocus
                                      value={editingCommentDraft}
                                      onChange={(e) => setEditingCommentDraft(e.target.value)}
                                      placeholder="Escreva seu comentário sobre este dia..."
                                      className="w-full rounded-xl bg-[#0b1228] text-slate-100 placeholder-slate-500 border border-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 px-3 py-2 text-sm resize-y"
                                    />
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setEditingLogId(null)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onUpdateRelapseComment(
                                            focusedVice.id,
                                            relapse.id,
                                            editingCommentDraft
                                          );
                                          setEditingLogId(null);
                                        }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                                      >
                                        Salvar comentário
                                      </button>
                                    </div>
                                  </div>
                                ) : relapse.context ? (
                                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap bg-[#0b1228] border border-slate-800/80 rounded-lg px-3 py-2.5">
                                    {relapse.context}
                                  </p>
                                ) : (
                                  <p className="text-xs text-slate-500 italic">
                                    Nenhum comentário escrito neste registro.
                                  </p>
                                )}

                                {relapse.plan && (
                                  <p className="text-[11px] text-emerald-300/90">
                                    Se acontecer de novo: {relapse.plan}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        )}

        {/* Other Tracked Vices */}
        {otherVices.length > 0 && (
          <div className="space-y-3 pt-1">
            <p className="text-[11px] font-semibold tracking-wider text-slate-400">
              Outros vícios rastreados
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherVices.map((v) => {
                const days = getViceCleanDays(v, todayKey);
                const best = getViceBestDays(v, todayKey);
                const rCount = v.relapses.length;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setFocusedViceId(v.id);
                      setConfirmingRelapseViceId(null);
                      setEditingLogId(null);
                    }}
                    className="text-left rounded-2xl bg-[#0b1228] hover:bg-[#0e1733] border border-slate-800/90 hover:border-indigo-500/40 p-4 transition-all cursor-pointer space-y-3"
                  >
                    <span className="text-xs font-bold text-slate-300 line-clamp-1 block">
                      {v.name}
                    </span>
                    <div>
                      <div className="text-3xl font-black text-white tabular-nums">{days}</div>
                      <div className="text-[11px] font-bold tracking-wider text-slate-400">
                        Dias limpos
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 tabular-nums">
                      <span className="text-slate-200 font-semibold">Melhor: {best} dias</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {rCount} {rCount === 1 ? 'recaída' : 'recaídas'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
