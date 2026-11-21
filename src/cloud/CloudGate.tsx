import { Component, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import { Cloud, Loader2, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { auth } from './firebase';
import { stopSync, syncWithCloud } from './sync';
import { STORAGE_KEYS } from '../types/foco';

type Phase = 'loading' | 'login' | 'syncing' | 'ready';

export function validateSignupPassword(password: string, confirmPassword: string): string | null {
  if (password.length < 8) {
    return 'Use pelo menos 8 caracteres na senha.';
  }
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    return 'A senha precisa ter pelo menos uma letra e um número.';
  }
  if (password !== confirmPassword) {
    return 'As duas senhas não conferem.';
  }
  return null;
}

export function friendlyAuthError(error: unknown): string {
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
      return 'A senha precisa ser mais forte (mínimo 8 caracteres com letras e números).';
    case 'auth/missing-password':
      return 'Digite a senha.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Login com Google cancelado antes de concluir.';
    case 'auth/popup-blocked':
      return 'O navegador bloqueou a janela do Google. Permita pop-ups e tente de novo.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    case 'auth/network-request-failed':
      return 'Sem conexão com a internet. Verifique e tente de novo.';
    case 'auth/unauthorized-domain':
      return 'Domínio não autorizado no Firebase Authentication.';
    case 'auth/operation-not-allowed':
      return 'Login por e-mail/senha ainda não foi ativado no Firebase Console (Authentication → Sign-in method → E-mail/senha).';
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

class CloudErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen flex items-center justify-center px-4 bg-slate-50 dark:bg-slate-950">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-6 space-y-4 text-center">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              Erro na sincronização
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Não foi possível sincronizar os dados com a nuvem.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

export function CloudGate({ children }: { children: ReactNode }) {
  return (
    <CloudErrorBoundary>
      <CloudGateInner>{children}</CloudGateInner>
    </CloudErrorBoundary>
  );
}

function CloudGateInner({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [offlineNotice, setOfflineNotice] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const lastFocusCheck = useRef(0);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    applySavedTheme();
    const unsub = onAuthStateChanged(auth, async (user) => {
      userRef.current = user;
      if (!user) {
        stopSync();
        setPhase((p) => (p === 'ready' ? p : 'login'));
        return;
      }
      setPhase((p) => (p === 'ready' ? p : 'syncing'));
      setSyncError(null);
      try {
        const result = await syncWithCloud(user.uid);
        if (result === 'offline') setOfflineNotice(true);
        else setOfflineNotice(false);
        setPhase('ready');
      } catch {
        setSyncError('Erro de permissão ao sincronizar seus dados na nuvem.');
        setOfflineNotice(true);
        setPhase('ready');
      }
    });
    return unsub;
  }, []);

  // Ao voltar para o app, confere se outro dispositivo salvou algo mais novo.
  useEffect(() => {
    if (phase !== 'ready') return;
    const check = async () => {
      const user = userRef.current;
      if (!user) return;
      const now = Date.now();
      if (now - lastFocusCheck.current < 30_000) return;
      lastFocusCheck.current = now;
      try {
        const result = await syncWithCloud(user.uid);
        if (result === 'pulled') window.location.reload();
        if (result === 'offline') setOfflineNotice(true);
        else setOfflineNotice(false);
      } catch {
        setOfflineNotice(true);
      }
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
        {(offlineNotice || syncError) && (
          <div
            role="status"
            className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-4 py-1.5 text-xs font-medium shadow"
          >
            {syncError ??
              'Sem conexão com a nuvem. Suas alterações ficam neste dispositivo e sincronizam depois.'}
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

export function GoogleIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

function LoginScreen({ onSkip }: { onSkip: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === 'signup') {
      const passwordError = validateSignupPassword(password, confirmPassword);
      if (passwordError) {
        setError(passwordError);
        return;
      }
    }

    setBusy('email');
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        void sendEmailVerification(cred.user).catch(() => undefined);
      }
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(null);
    }
  };

  const loginWithGoogle = async () => {
    setError(null);
    setInfo(null);
    setBusy('google');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(null);
    }
  };

  const resetPassword = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Digite seu e-mail acima e clique de novo em "Esqueci a senha".');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('Enviamos um e-mail para redefinir a senha. Veja também a caixa de spam.');
    } catch (err) {
      setError(friendlyAuthError(err));
    }
  };

  const inputClass =
    'w-full rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500';

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-slate-50 dark:bg-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-6 space-y-5"
      >
        <div className="text-center space-y-1">
          <div className="mx-auto w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
            <Cloud className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Foco
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {mode === 'login'
              ? 'Entre para ter seus dados protegidos e salvos na nuvem.'
              : 'Crie uma conta protegida para salvar seus dados na nuvem.'}
          </p>
        </div>

        <button
          type="button"
          onClick={loginWithGoogle}
          disabled={busy !== null}
          className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 disabled:opacity-60 text-slate-800 dark:text-slate-100 shadow-xs transition-colors cursor-pointer"
        >
          {busy === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
          <span>Entrar com Google</span>
        </button>

        <div className="relative flex items-center justify-center">
          <div className="w-full border-t border-slate-200 dark:border-slate-800" />
          <span className="bg-white dark:bg-slate-900 px-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            ou
          </span>
          <div className="w-full border-t border-slate-200 dark:border-slate-800" />
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
            minLength={mode === 'signup' ? 8 : 6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              mode === 'signup'
                ? 'Senha (mín. 8 caracteres, letras e números)'
                : 'Sua senha'
            }
            className={inputClass}
          />
          <AnimatePresence initial={false}>
            {mode === 'signup' && (
              <motion.div
                key="confirm-password"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme a senha"
                  className={inputClass}
                />
              </motion.div>
            )}
          </AnimatePresence>

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
            disabled={busy !== null}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white shadow-sm transition-colors cursor-pointer"
          >
            {busy === 'email' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'login' ? (
              <LogIn className="w-4 h-4" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            <span>{mode === 'login' ? 'Entrar com e-mail' : 'Criar conta'}</span>
          </button>
        </form>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>Dados protegidos por conta e validados no servidor</span>
        </div>

        <div className="flex flex-col items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setConfirmPassword('');
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
            Usar sem conta (dados só neste dispositivo)
          </button>
        </div>
      </motion.div>
    </main>
  );
}
