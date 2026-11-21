import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  AlertTriangle,
  Cloud,
  CloudOff,
  Loader2,
  LogIn,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { auth } from './firebase';
import { friendlyAuthError, GoogleIcon, validateSignupPassword } from './CloudGate';
import { clearLocalDataAndStop, flushPending, syncWithCloud } from './sync';

export function AccountSection() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [busy, setBusy] = useState<'google' | 'email' | 'sync' | 'logout' | 'verify' | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const finishSignIn = async (uid: string) => {
    const result = await syncWithCloud(uid);
    if (result === 'pulled') {
      window.location.reload();
      return;
    }
    setStatusMessage(
      result === 'offline'
        ? 'Conectado, aguardando internet para sincronizar.'
        : 'Dados sincronizados na nuvem.',
    );
  };

  const handleGoogleLogin = async () => {
    setBusy('google');
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await finishSignIn(cred.user.uid);
    } catch (err) {
      setErrorMessage(friendlyAuthError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (mode === 'signup') {
      const passwordError = validateSignupPassword(password, confirmPassword);
      if (passwordError) {
        setErrorMessage(passwordError);
        return;
      }
    }

    setBusy('email');
    try {
      if (mode === 'login') {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        await finishSignIn(cred.user.uid);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        void sendEmailVerification(cred.user).catch(() => undefined);
        await finishSignIn(cred.user.uid);
      }
    } catch (err) {
      setErrorMessage(friendlyAuthError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleResetPassword = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (!email.trim()) {
      setErrorMessage('Digite seu e-mail acima e clique de novo em "Esqueci a senha".');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setStatusMessage('Enviamos um e-mail para redefinir a senha.');
    } catch (err) {
      setErrorMessage(friendlyAuthError(err));
    }
  };

  const handleSendVerification = async () => {
    if (!user) return;
    setBusy('verify');
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await sendEmailVerification(user);
      setStatusMessage('E-mail de verificação enviado! Confira sua caixa de entrada e spam.');
    } catch (err) {
      setErrorMessage(friendlyAuthError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleRefreshVerification = async () => {
    if (!user) return;
    setBusy('verify');
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await user.reload();
      setUser(auth.currentUser);
      setStatusMessage(
        auth.currentUser?.emailVerified
          ? 'E-mail verificado com sucesso!'
          : 'O e-mail ainda não foi confirmado.',
      );
    } catch {
      setErrorMessage('Não foi possível atualizar o status da conta.');
    } finally {
      setBusy(null);
    }
  };

  const handleManualSync = async () => {
    if (!user) return;
    setBusy('sync');
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await flushPending();
      const result = await syncWithCloud(user.uid);
      if (result === 'pulled') {
        window.location.reload();
        return;
      }
      setStatusMessage(
        result === 'offline'
          ? 'Sem conexão com a nuvem no momento.'
          : 'Sincronização concluída.',
      );
    } catch {
      setErrorMessage('Erro ao sincronizar dados com a nuvem.');
    } finally {
      setBusy(null);
    }
  };

  const handleLogout = async () => {
    setBusy('logout');
    try {
      await flushPending();
      clearLocalDataAndStop();
      await signOut(auth);
    } finally {
      window.location.reload();
    }
  };

  const inputClass =
    'w-full rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-800 px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500';

  if (!user) {
    return (
      <section
        aria-label="Conta e nuvem"
        className="mt-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
              <CloudOff className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                Sincronização na nuvem desativada
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Entre com Google ou e-mail e senha para salvar seus dados com segurança na nuvem.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 disabled:opacity-60 text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
            >
              {busy === 'google' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GoogleIcon />}
              <span>Entrar com Google</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowEmailForm((v) => !v);
                setErrorMessage(null);
                setStatusMessage(null);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{showEmailForm ? 'Ocultar formulário' : 'E-mail / Criar conta'}</span>
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showEmailForm && (
            <motion.form
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              onSubmit={handleEmailSubmit}
              className="overflow-hidden pt-3 border-t border-slate-200/80 dark:border-slate-800 space-y-2.5"
            >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden sm:col-span-2"
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
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'login' ? 'signup' : 'login');
                    setConfirmPassword('');
                    setErrorMessage(null);
                    setStatusMessage(null);
                  }}
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                >
                  {mode === 'login' ? 'Não tenho conta — criar uma' : 'Já tenho conta — entrar'}
                </button>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                  >
                    Esqueci a senha
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={busy !== null}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white transition-colors cursor-pointer"
              >
                {busy === 'email' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : mode === 'login' ? (
                  <LogIn className="w-3.5 h-3.5" />
                ) : (
                  <UserPlus className="w-3.5 h-3.5" />
                )}
                <span>{mode === 'login' ? 'Entrar com e-mail' : 'Criar conta'}</span>
              </button>
            </div>
            </motion.form>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {statusMessage && (
            <motion.p
              key="logged-out-status"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              role="status"
              className="text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              {statusMessage}
            </motion.p>
          )}
          {errorMessage && (
            <motion.p
              key="logged-out-error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              role="alert"
              className="text-xs font-medium text-rose-600 dark:text-rose-400"
            >
              {errorMessage}
            </motion.p>
          )}
        </AnimatePresence>
      </section>
    );
  }

  return (
    <section
      aria-label="Conta e nuvem"
      className="mt-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Cloud className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                Salvo na nuvem
              </p>
              {user.emailVerified ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-3 h-3" />
                  Conta verificada
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3" />
                  E-mail não verificado
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {user.email || user.displayName}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} />
            <span>Sincronizar agora</span>
          </button>

          {confirmLogout ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleLogout}
                disabled={busy !== null}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-60 transition-colors cursor-pointer"
              >
                Confirmar saída
              </button>
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                disabled={busy !== null}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair da conta</span>
            </button>
          )}
        </div>
      </div>

      {!user.emailVerified && (
        <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            Confirme seu e-mail para aumentar a segurança e recuperação da sua conta.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSendVerification}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-60 cursor-pointer"
            >
              <MailCheck className="w-3.5 h-3.5" />
              <span>Reenviar verificação</span>
            </button>
            <button
              type="button"
              onClick={handleRefreshVerification}
              disabled={busy !== null}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
            >
              Já confirmei
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {confirmLogout && (
          <motion.p
            key="confirm-logout-note"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            Seus dados continuam salvos na nuvem e são limpos deste navegador ao sair.
          </motion.p>
        )}
        {statusMessage && (
          <motion.p
            key="logged-in-status"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            role="status"
            className="text-xs font-medium text-emerald-600 dark:text-emerald-400"
          >
            {statusMessage}
          </motion.p>
        )}
        {errorMessage && (
          <motion.p
            key="logged-in-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            role="alert"
            className="text-xs font-medium text-rose-600 dark:text-rose-400"
          >
            {errorMessage}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}
