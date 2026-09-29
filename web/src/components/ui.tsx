import { createContext, useCallback, useContext, useRef, useState, type CSSProperties, type ReactNode } from 'react';

// ─── toasts ───────────────────────────────────────────────────────────────
type ToastFn = (msg: string, kind?: 'ok' | 'error') => void;
const ToastCtx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; kind: 'ok' | 'error' } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback<ToastFn>((msg, kind = 'ok') => {
    setT({ msg, kind });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setT(null), kind === 'error' ? 5000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div className={`toast${t.kind === 'error' ? ' error' : ''}`} role="status">{t.msg}</div>}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Wraps an async action with an error toast. */
export function useAction() {
  const toast = useToast();
  return useCallback(async <T,>(fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | undefined> => {
    try {
      const r = await fn();
      if (ok) toast(typeof ok === 'function' ? ok(r) : ok);
      return r;
    } catch (e) {
      toast((e as Error).message, 'error');
      return undefined;
    }
  }, [toast]);
}

// ─── small pieces ─────────────────────────────────────────────────────────
export function Pills<T extends string | number>({ options, value, onChange, className = '', style, btnStyle }: {
  options: readonly (readonly [T, string])[] | { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  style?: CSSProperties;
  btnStyle?: CSSProperties;
}) {
  const opts = (options as unknown[]).map((o) =>
    Array.isArray(o) ? { value: o[0] as T, label: o[1] as string, disabled: false } : (o as { value: T; label: string; disabled?: boolean }));
  return (
    <div className={`pills ${className}`} style={style} role="group">
      {opts.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} disabled={o.disabled}
          onClick={() => onChange(o.value)} style={btnStyle}>{o.label}</button>
      ))}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading">{label}</div>;
}

export function ErrorNote({ error }: { error: unknown }) {
  return <div className="empty">Couldn’t load this: {(error as Error)?.message ?? 'unknown error'}</div>;
}

export function Kicker({ children, accent, style }: { children: ReactNode; accent?: boolean; style?: CSSProperties }) {
  return <div className={accent ? 'kicker-accent' : 'kicker'} style={style}>{children}</div>;
}

export function Check({ size = 28, stroke = 'var(--color-text)' }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="3" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function PlayIcon({ size = 22, fill = '#fff' }: { size?: number; fill?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden><polygon points="7 4 20 12 7 20 7 4" /></svg>;
}

export function PauseIcon({ size = 22, fill = '#fff' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden>
      <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

export function Progress({ pct, color, height = 8, style }: { pct: number; color?: string; height?: number; style?: CSSProperties }) {
  return (
    <div className="progress" style={{ height, ...style }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function Dialog({ title, body, children, onClose }: { title: string; body?: ReactNode; children: ReactNode; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-title">{title}</div>
        {body && <div className="dialog-body">{body}</div>}
        {children}
      </div>
    </div>
  );
}

/** Six (or four) digit boxes for OTP entry, backed by one hidden input. */
export function CodeBoxes({ value, onChange, length = 6, autoFocus }: {
  value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ position: 'relative' }} onClick={() => ref.current?.focus()}>
      <input ref={ref} value={value} autoFocus={autoFocus} inputMode="numeric" autoComplete="one-time-code"
        aria-label={`${length}-digit code`} maxLength={length}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'text' }} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${length},1fr)`, gap: 6 }} aria-hidden>
        {Array.from({ length }, (_, i) => (
          <div key={i} style={{
            height: 56, border: `2px solid ${i === value.length ? 'var(--color-accent)' : 'var(--color-divider)'}`,
            background: 'var(--color-surface)', borderRadius: 14, display: 'grid', placeItems: 'center',
            font: '600 24px/1 var(--font-heading)',
          }}>{value[i] ?? ''}</div>
        ))}
      </div>
    </div>
  );
}
