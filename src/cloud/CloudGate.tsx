import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  type User,
} from 'firebase/auth';
import { Cloud, Loader2, LogIn, UserPlus } from 'lucide-react';
import { auth } from './firebase';
import { stopSync, syncWithCloud } from './sync';
import { STORAGE_KEYS } from '../types/foco';

type Phase = 'loading' | 'login' | 'syncing' | 'ready';

function friendlyError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos.';
    case 'auth/invalid-email':
      return 'Esse e-mail não parece válido.';
    case 'auth/email-already-in-use':
      return 'Já existe uma conta com esse e-mail. Use "Entrar".';
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.';
    case 'auth/missing-password':
      return 'Digite a senha.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    case 'auth/network-request-failed':
      return 'Sem conexão com a internet. Verifique e tente de novo.';
    case 'auth/operation-not-allowed':
      return 'Login por e-mail/senha ainda não foi ativado no Firebase (Authentication).';
    default:
      return 'Não foi possível concluir. Tente novamente.';
  }
}

function applySavedTheme(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    const dark = saved
      ? saved === 'dark'
      : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', Boolean(dark));
  } catch {
    // ignora
  }
}

export function CloudGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [offlineNotice, setOfflineNotice] = useState(false);
  const lastFocusCheck = useRef(0);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    applySavedTheme();
    if (!auth) {
      setPhase('ready');
      return;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      userRef.current = user;
      if (!user) {
        stopSync();
        setPhase((p) => (p === 'ready' ? p : 'login'));
        return;
      }
      setPhase((p) => (p === 'ready' ? p : 'syncing'));
      const result = await syncWithCloud(user.uid);
      if (result === 'offline') setOfflineNotice(true);
      setPhase('ready');
    });
    return unsub;
  }, []);

  // Ao voltar para o app, confere se outro computador salvou algo mais novo.
  useEffect(() => {
    if (phase !== 'ready') return;
    const check = async () => {
      const user = userRef.current;
      if (!user) return;
      const now = Date.now();
      if (now - lastFocusCheck.current < 30_000) return;
      lastFocusCheck.current = now;
      const result = await syncWithCloud(user.uid);
      if (result === 'pulled') window.location.reload();
      if (result === 'offline') setOfflineNotice(true);
      else setOfflineNotice(false);
    };
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    return () => {
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
    };
  }, [phase]);

  if (phase === 'ready') {
    return (
      <>
        {children}
        {offlineNotice && (
          <div
            role="status"
            className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-4 py-1.5 text-xs font-medium shadow"
          >
            Sem conexão com a nuvem. Suas alterações ficam neste PC e sincronizam depois.
          </div>
        )}
      </>
    );
  }

  if (phase === 'loading' || phase === 'syncing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">
          {phase === 'syncing' ? 'Sincronizando seus dados…' : 'Carregando…'}
        </p>
      </div>
    );
  }

  return <LoginScreen onSkip={() => setPhase('ready')} />;
}

function LoginScreen({ onSkip }: { onSkip: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth) {
      setError('Autenticação na nuvem não configurada.');
      return;
    }
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    setInfo(null);
    if (!auth) {
      setError('Autenticação na nuvem não configurada.');
      return;
    }
    if (!email.trim()) {
      setError('Digite seu e-mail acima e clique de novo em "Esqueci a senha".');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('Enviamos um e-mail para redefinir a senha. Veja também a caixa de spam.');
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const inputClass =
    'w-full rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500';

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="mx-auto w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
            <Cloud className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Foco
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {mode === 'login'
              ? 'Entre para ter seus dados em qualquer computador.'
              : 'Crie uma conta para salvar seus dados na nuvem.'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Seu e-mail"
            className={inputClass}
          />
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha (mínimo 6 caracteres)"
            className={inputClass}
          />

          {error && (
            <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white shadow-sm transition-colors cursor-pointer"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'login' ? (
              <LogIn className="w-4 h-4" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            <span>{mode === 'login' ? 'Entrar' : 'Criar conta'}</span>
          </button>
        </form>

        <div className="flex flex-col items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError(null);
              setInfo(null);
            }}
            className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
          >
            {mode === 'login' ? 'Não tenho conta — criar uma' : 'Já tenho conta — entrar'}
          </button>
          {mode === 'login' && (
            <button
              type="button"
              onClick={resetPassword}
              className="text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
            >
              Esqueci a senha
            </button>
          )}
          <button
            type="button"
            onClick={onSkip}
            className="text-slate-400 dark:text-slate-500 hover:underline cursor-pointer"
          >
            Usar sem conta (dados só neste computador)
          </button>
        </div>
      </div>
    </main>
  );
}
