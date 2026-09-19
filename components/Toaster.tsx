"use client";

/**
 * Toast viewport. Enter: translateY(100%)→0 @380ms ease-out; exit 200ms (asymmetric, faster).
 * Transitions (not keyframes) so rapid stacks retarget smoothly. Progress ribbons render
 * inside stage toasts (sweeper, wrap). Transform/opacity only.
 */
import { useToasts, type Toast } from "@/store/toasts";

const TONE: Record<Toast["tone"], { border: string; glow: string; dot: string }> = {
  info: { border: "var(--line2)", glow: "none", dot: "var(--muted)" },
  ok: { border: "rgba(111,227,165,.55)", glow: "0 0 14px rgba(111,227,165,.25)", dot: "var(--jade)" },
  warn: { border: "rgba(245,165,36,.55)", glow: "0 0 14px rgba(245,165,36,.25)", dot: "var(--honey)" },
  bad: { border: "rgba(255,107,122,.6)", glow: "0 0 14px rgba(255,107,122,.28)", dot: "var(--coral)" },
  violet: { border: "rgba(167,139,250,.6)", glow: "0 0 16px rgba(167,139,250,.35)", dot: "#a78bfa" },
};

function ToastCard({ t }: { t: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const tone = TONE[t.tone];
  return (
    <div
      role="status"
      data-closing={!!t.closing}
      className="pointer-events-auto w-[min(360px,calc(100vw-24px))] border p-3"
      style={{
        background: "linear-gradient(180deg, var(--panel2), var(--panel))",
        borderColor: tone.border,
        boxShadow: tone.glow,
        opacity: t.closing ? 0 : 1,
        transform: t.closing ? "translateY(8px) scale(0.98)" : "translateY(0) scale(1)",
        transition: "transform 200ms var(--ease-out), opacity 200ms var(--ease-out)",
      }}
      data-enter="true"
    >
      <div className="flex items-start gap-2">
        <span className="mt-[5px] h-[7px] w-[7px] shrink-0" style={{ background: tone.dot, boxShadow: `0 0 8px ${tone.dot}` }} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold tracking-wide" style={{ color: "var(--text)" }}>
            {t.title}
          </p>
          {t.stage && (
            <p className="num mt-0.5 text-[10.5px] uppercase tracking-[0.1em]" style={{ color: tone.dot }}>
              {t.stage}
            </p>
          )}
          {t.body && (
            <p className="num mt-1 break-words text-[11px]" style={{ color: "var(--muted)" }}>
              {t.body}
            </p>
          )}
          {t.progress !== undefined && (
            <div className="bar mt-2">
              <i style={{ width: `${Math.round(t.progress * 100)}%` }} />
            </div>
          )}
          {t.action && (
            <button
              className="btn btn-ghost mt-2 !px-2 !py-1 text-[10.5px]"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
        <button className="btn btn-ghost btn-icon !p-1" onClick={() => dismiss(t.id)} aria-label="dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-14 right-3 z-[70] flex flex-col-reverse gap-2 lg:bottom-3">
      {toasts.map((t) => (
        <div key={t.id} className="toast-enter-wrap">
          <ToastCard t={t} />
        </div>
      ))}
      <style jsx global>{`
        .toast-enter-wrap {
          animation: toast-in 380ms var(--ease-out);
        }
        @keyframes toast-in {
          from {
            opacity: 0;
            transform: translateY(100%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .toast-enter-wrap {
            animation-duration: 1ms;
          }
        }
      `}</style>
    </div>
  );
}
