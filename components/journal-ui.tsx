"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  LoaderCircle,
  ShieldCheck,
  Sprout,
  X,
} from "lucide-react";
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Request failed. Please try again.");
  return data;
}
export function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? "brand-light" : ""}`}>
      <span className="brand-mark">
        <Sprout size={27} />
      </span>
      <span>
        still<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
export const shiftDate = (date: string, n: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function dateInZone(zone: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k)!.value)
    .join("-");
}
export function Auth({ onComplete }: { onComplete: () => Promise<void> }) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(`auth/${mode}`, "POST", Object.fromEntries(form));
      await onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setBusy(true);
    setError("");
    try {
      await api("auth/demo", "POST", {});
      await onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-art">
        <div className="auth-shade" />
        <div className="auth-brand">
          <Brand light />
          <span>MENTAL HEALTH WELLNESS</span>
        </div>
        <div className="auth-story">
          <span className="overline">A SPACE TO COME BACK TO YOURSELF</span>
          <h1>
            A little pause.
            <br />A clearer you.
          </h1>
          <p>
            Notice how you feel. Make room for reflection.
            <br />
            Understand your everyday patterns.
          </p>
          <div className="auth-caption">
            <span className="little-line" /> One day at a time.
          </div>
        </div>
        <span className="auth-footnote">YOUR STORY, AT YOUR OWN PACE.</span>
      </section>
      <section className="auth-form-side">
        <span className="auth-topline">
          Already finding your rhythm?{" "}
          <button
            onClick={() => {
              setMode(mode === "register" ? "login" : "register");
              setError("");
            }}
          >
            {mode === "register" ? "Sign in" : "Create an account"}{" "}
            <ArrowUpRight size={14} />
          </button>
        </span>
        <div className="auth-form-wrap">
          <div className="auth-symbol">
            <Sprout size={30} strokeWidth={1.3} />
          </div>
          <p className="eyebrow">YOUR QUIET CORNER</p>
          <h2>
            {mode === "register" ? "Make space for yourself." : "Welcome back."}
          </h2>
          <p>
            {mode === "register"
              ? "A journal, a little perspective, and room to grow."
              : "Your reflections are right where you left them."}
          </p>
          <form onSubmit={submit}>
            {mode === "register" && (
              <label>
                Your name
                <input
                  name="name"
                  required
                  maxLength={60}
                  autoComplete="given-name"
                  placeholder="What should we call you?"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                placeholder={
                  mode === "register"
                    ? "At least 10 characters"
                    : "Your password"
                }
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button full-width" disabled={busy}>
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <>
                  {mode === "register" ? "Create my space" : "Enter my space"}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <div className="auth-divider">
            <span />
            or take a look around
            <span />
          </div>
          <button
            className="secondary-button full-width"
            disabled={busy}
            onClick={demo}
          >
            Explore a demo workspace <ArrowUpRight size={16} />
          </button>
          <p className="auth-demo-note">
            28 days of sample reflections. No account needed.
          </p>
          <p className="auth-privacy">
            <ShieldCheck size={15} />
            Your journal stays in your account. You choose if AI is used.
          </p>
        </div>
        <span className="auth-bottom">
          A self-awareness companion. Not a clinical service.
        </span>
      </section>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector(
      '[role="dialog"]',
    ) as HTMLElement | null;
    dialog?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialog) {
        const elements = [
          ...dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select, textarea, [tabindex="0"]',
          ),
        ].filter((element) => element.getClientRects().length > 0);
        const first = elements[0],
          last = elements.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
