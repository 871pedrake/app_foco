import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { Cloud, LogOut } from 'lucide-react';
import { auth } from './firebase';
import { clearLocalDataAndStop, flushPending } from './sync';

export function AccountSection() {
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  if (!auth || !user) return null;

  const handleLogout = async () => {
    const ok = window.confirm(
      'Sair da conta? Seus dados continuam salvos na nuvem e voltam quando você entrar de novo.',
    );
    if (!ok) return;
    setBusy(true);
    try {
      await flushPending();
      clearLocalDataAndStop();
      if (auth) await signOut(auth);
    } finally {
      window.location.reload();
    }
  };

  return (
    <section
      aria-label="Conta e nuvem"
      className="mt-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 flex flex-wrap items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
          <Cloud className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900 dark:text-white">
            Salvo na nuvem
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span>Sair da conta</span>
      </button>
    </section>
  );
}
