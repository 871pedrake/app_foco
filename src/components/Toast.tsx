interface ToastProps {
  message: string | null;
  visible: boolean;
}

export function Toast({ message, visible }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-200 ${
        visible && message ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <div className="max-w-[92vw] truncate px-4 py-2 rounded-full text-xs font-medium bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg">
        {message}
      </div>
    </div>
  );
}
