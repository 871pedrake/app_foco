import { AnimatePresence, motion } from 'motion/react';

interface ToastProps {
  message: string | null;
  visible: boolean;
}

export function Toast({ message, visible }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
    >
      <AnimatePresence>
        {visible && message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="max-w-[92vw] truncate px-4 py-2 rounded-full text-xs font-medium bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
