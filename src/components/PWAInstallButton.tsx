import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../pwa/usePWAInstall';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <motion.button
        type="button"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => {
          void install();
        }}
        title="Instalar Foco como aplicativo"
        className={`inline-flex items-center gap-1.5 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm'
        }`}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Instalar App</span>
      </motion.button>
    );
  }

  if (isIOS || isAndroid || !compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          title={isIOS ? 'Como instalar no iPhone / iPad' : 'Como instalar no celular ou PC'}
          className={`inline-flex items-center gap-1.5 rounded-lg font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <span>{isIOS ? 'Instalar no iOS' : 'Instalar App'}</span>
        </button>

        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGuide(false)}
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="pwa-install-guide-title"
                className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <h3
                      id="pwa-install-guide-title"
                      className="text-base font-bold text-slate-900 dark:text-white"
                    >
                      {isIOS ? 'Instalar no iPhone / iPad' : 'Instalar Foco no celular'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGuide(false)}
                    aria-label="Fechar instruções"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {isIOS ? (
                  <ol className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-2 list-decimal pl-4">
                    <li>
                      No Safari, toque no botão <strong>Compartilhar</strong> na barra inferior.
                    </li>
                    <li>
                      Role para baixo e toque em <strong>Adicionar à Tela de Início</strong>.
                    </li>
                    <li>
                      Toque em <strong>Adicionar</strong> para abrir o Foco em tela cheia com cross-play.
                    </li>
                  </ol>
                ) : (
                  <ol className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-2 list-decimal pl-4">
                    <li>
                      Abra o Foco no <strong>Chrome</strong> do Android pelo link compartilhado.
                    </li>
                    <li>
                      Toque no menu <strong>⋮</strong> (três pontinhos) no canto superior direito.
                    </li>
                    <li>
                      Selecione <strong>Adicionar à tela inicial</strong> ou{' '}
                      <strong>Instalar aplicativo</strong>.
                    </li>
                  </ol>
                )}

                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="w-full py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                >
                  Entendi
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          role="status"
          className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Modo offline — dados salvos localmente</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
