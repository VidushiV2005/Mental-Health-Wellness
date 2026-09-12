"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Feather,
  FileText,
  Heart,
  LayoutGrid,
  Leaf,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  TrendingUp,
  Wind,
  X,
  Pencil,
  Search,
} from "lucide-react";
import type {
  Analysis,
  Entry,
  Message,
  Metric,
  Report,
  User,
} from "@/lib/types";

type Page =
  "Overview" | "My journal" | "Patterns" | "Reports" | "Companion" | "Settings";
type Me = {
  user: User;
  aiConfigured: boolean;
  database: string;
  model: string;
  embeddingMode: string;
};
const navigation = [
  { name: "Overview", icon: LayoutGrid },
  { name: "My journal", icon: BookOpen },
  { name: "Patterns", icon: TrendingUp },
  { name: "Reports", icon: FileText },
  { name: "Companion", icon: Sparkles },
] as const;
const metricLabels: Record<Metric, string> = {
  valence: "Mood",
  stress: "Stress",
  energy: "Energy",
  clarity: "Clarity",
};
const dateLabel = (date: string, full = false) =>
  new Date(date.length === 10 ? `${date}T12:00:00` : date).toLocaleDateString(
    "en-US",
    {
      month: full ? "long" : "short",
      day: "numeric",
      ...(full ? { year: "numeric" } : {}),
    },
  );
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data as T;
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? "brand-light" : ""}`}>
      <span className="brand-mark">
        <Sprout size={27} strokeWidth={1.6} />
      </span>
      <span>
        still<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Face({ value, size = 27 }: { value: number; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.5" cy="13" r="1.1" fill="currentColor" />
      <circle cx="20.5" cy="13" r="1.1" fill="currentColor" />
      <path
        d={
          value >= 7
            ? "M10 19 Q16 26 22 19"
            : value >= 5
              ? "M11 20 Q16 22 21 20"
              : value >= 3
                ? "M11 21 L21 21"
                : "M11 23 Q16 17 21 23"
        }
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Empty({
  icon: Icon = BookOpen,
  title,
  children,
}: {
  icon?: typeof BookOpen;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={30} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export default function Workspace() {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [page, setPage] = useState<Page>("Overview");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [period, setPeriod] = useState(30);
  const [editor, setEditor] = useState<Entry | "new" | null>(null);
  const [initialMood, setInitialMood] = useState(6);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [breathing, setBreathing] = useState(false);
  const [help, setHelp] = useState(false);
  async function refresh(days = period) {
    const [entryData, analysisData, reportData] = await Promise.all([
      api<{ entries: Entry[] }>("entries"),
      api<{ analysis: Analysis }>(`analytics?days=${days}`),
      api<{ reports: Report[] }>("reports"),
    ]);
    setEntries(entryData.entries);
    setAnalysis(analysisData.analysis);
    setReports(reportData.reports);
  }
  useEffect(() => {
    let active = true;
    api<Me>("me")
      .then(async (data) => {
        if (!active) return;
        setMe(data);
        await refresh();
      })
      .catch(() => {})
      .finally(() => {
        if (active) setBooting(false);
      });
    return () => {
      active = false;
    };
  }, []); // initial session recovery
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  async function authenticated() {
    setBusy(true);
    try {
      const data = await api<Me>("me");
      setMe(data);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: Page) {
    setPage(next);
    setSidebar(false);
    setError("");
  }
  async function changePeriod(value: number) {
    setPeriod(value);
    try {
      const data = await api<{ analysis: Analysis }>(`analytics?days=${value}`);
      setAnalysis(data.analysis);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function generateReport() {
    setBusy(true);
    setError("");
    try {
      const { report } = await api<{ report: Report }>("reports", "POST", {});
      setReports((prev) => [report, ...prev]);
      navigate("Reports");
      setToast("Your awareness report is ready.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    try {
      await api("auth/logout", "POST", {});
      setMe(null);
      setEntries([]);
      setReports([]);
      setAnalysis(null);
      setPage("Overview");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (booting)
    return (
      <div className="loading-screen">
        <Brand />
        <LoaderCircle className="spin" size={24} />
        <p>Opening your quiet space…</p>
      </div>
    );
  if (!me) return <Auth onComplete={authenticated} />;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "is-open" : ""}`}>
        <a
          className="brand-link"
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <Brand />
        </a>
        <span className="sidebar-caption">YOUR SPACE TO REFLECT</span>
        <nav aria-label="Main navigation">
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              onClick={() => navigate(name)}
              aria-current={page === name ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.6} />
              <span>{name}</span>
              {name === "Companion" && <span className="ai-badge">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-note">
            <Leaf size={23} strokeWidth={1.3} />
            <p>
              Small reflections.
              <br />A little more clarity.
            </p>
            <span>One day at a time.</span>
          </div>
          <button
            className={`nav-item ${page === "Settings" ? "active" : ""}`}
            onClick={() => navigate("Settings")}
          >
            <Settings size={19} strokeWidth={1.5} />
            Settings
          </button>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={19} strokeWidth={1.5} />
            About this space
          </button>
          <div className="profile">
            <span className="avatar">
              {me.user.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{me.user.name}</strong>
              <small>
                {me.user.demo ? "Demo workspace" : "Personal workspace"}
              </small>
            </div>
            <button
              className="icon-button"
              onClick={signOut}
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebar(true)}
            >
              <Menu size={21} />
            </button>
            <span>My workspace</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="privacy-label">
              <ShieldCheck size={15} />
              Your space, your data
            </span>
            <span className="top-avatar">{me.user.name[0]}</span>
          </div>
        </header>
        <main className="workspace" id="main-content">
          {me.user.demo && (
            <div className="demo-banner">
              <span>
                <span className="live-dot" />
                You’re exploring a demo with sample reflections.
              </span>
              <button onClick={signOut}>
                Create your own space <ArrowRight size={14} />
              </button>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          <div key={page} className="page-enter">
            {page === "Overview" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">
                      <Sun size={14} /> A MOMENT FOR YOU
                    </p>
                    <h1>A little pause. A clearer you.</h1>
                    <p>
                      Welcome back, {me.user.name.split(" ")[0]}. Let’s see how
                      you’ve been.
                    </p>
                  </div>
                  <div className="date-chip">
                    <CalendarDays size={16} />
                    {dateLabel(today(), true)}
                  </div>
                </div>
                <div className="overview-grid">
                  <section className="overview-primary">
                    <div className="section-title">
                      <h2>Your wellbeing, at a glance</h2>
                      <label className="period-select">
                        <select
                          value={period}
                          onChange={(e) => changePeriod(Number(e.target.value))}
                          aria-label="Analysis period"
                        >
                          <option value={7}>Last 7 days</option>
                          <option value={30}>Last 30 days</option>
                          <option value={90}>Last 90 days</option>
                          <option value={365}>Last year</option>
                        </select>
                        <ChevronDown size={13} />
                      </label>
                    </div>
                    <div className="metrics-strip">
                      {(
                        ["valence", "stress", "energy", "clarity"] as Metric[]
                      ).map((metric, i) => (
                        <div className="metric" key={metric}>
                          <span>
                            {metricLabels[metric]}
                            {i === 0 ? (
                              <Heart size={15} />
                            ) : i === 1 ? (
                              <Wind size={15} />
                            ) : i === 2 ? (
                              <Sun size={15} />
                            ) : (
                              <Sprout size={15} />
                            )}
                          </span>
                          <div>
                            <strong>
                              {analysis?.dayCount
                                ? analysis.averages[metric].toFixed(1)
                                : "—"}
                            </strong>
                            <small>/ 10</small>
                          </div>
                          <p>
                            {analysis?.dayCount
                              ? `Average of ${analysis.dayCount} days`
                              : "Your story starts here"}
                          </p>
                        </div>
                      ))}
                    </div>
                    <TrendChart analysis={analysis} />
                    <div className="section-title insights-title">
                      <div>
                        <h2>What your reflections are saying</h2>
                        <p>Observations from your entries, with context.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("Patterns")}
                      >
                        All patterns <ArrowRight size={15} />
                      </button>
                    </div>
                    <div className="insight-list">
                      {analysis?.findings.length ? (
                        analysis.findings.slice(0, 2).map((finding, i) => (
                          <button
                            className="insight-row"
                            key={finding.id}
                            onClick={() => navigate("Patterns")}
                          >
                            <span className="insight-icon">
                              {i === 0 ? (
                                <Leaf size={21} />
                              ) : (
                                <TrendingUp size={21} />
                              )}
                            </span>
                            <span>
                              <strong>{finding.title}</strong>
                              <small>
                                {finding.n} observed days · View the evidence
                              </small>
                            </span>
                            <ArrowUpRight size={18} />
                          </button>
                        ))
                      ) : (
                        <div className="growing-insight">
                          <Sprout size={23} />
                          <div>
                            <strong>Your patterns need a little time.</strong>
                            <p>
                              Log at least 14 days to explore associations in
                              your routine.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="recent-heading section-title">
                      <h2>Recent reflections</h2>
                      <button
                        className="text-button"
                        onClick={() => navigate("My journal")}
                      >
                        Open journal <ArrowRight size={15} />
                      </button>
                    </div>
                    {entries.length ? (
                      entries.slice(0, 2).map((entry) => (
                        <button
                          className="recent-entry"
                          key={entry.id}
                          onClick={() => setEditor(entry)}
                        >
                          <div className="entry-date">
                            <strong>
                              {new Date(`${entry.date}T12:00:00`).getDate()}
                            </strong>
                            <span>
                              {new Date(
                                `${entry.date}T12:00:00`,
                              ).toLocaleDateString("en-US", { month: "short" })}
                            </span>
                          </div>
                          <div>
                            <strong>
                              {entry.tags[0]
                                ? `A moment with ${entry.tags[0].toLowerCase()}`
                                : "A moment to reflect"}
                            </strong>
                            <p>
                              {entry.narrative ||
                                "A quiet check-in with yourself."}
                            </p>
                          </div>
                          <span className="entry-mood">
                            <Face value={entry.valence} size={22} />
                            {entry.valence}/10
                          </span>
                        </button>
                      ))
                    ) : (
                      <Empty title="Your next chapter starts here">
                        Add your first reflection to begin building your
                        journal.
                      </Empty>
                    )}
                  </section>
                  <aside className="context-column">
                    <section className="checkin-panel">
                      <div className="panel-eyebrow">
                        <span className="live-dot" />
                        DAILY CHECK-IN<span>~ 2 MIN</span>
                      </div>
                      <h2>
                        How are you, <br />
                        really?
                      </h2>
                      <p>
                        No right answers. Just you,
                        <br />
                        checking in with yourself.
                      </p>
                      <div className="mood-picker">
                        {[
                          { v: 2, label: "Low" },
                          { v: 4, label: "A bit off" },
                          { v: 6, label: "Okay" },
                          { v: 8, label: "Good" },
                          { v: 10, label: "Great" },
                        ].map((m) => (
                          <button
                            key={m.v}
                            onClick={() => setInitialMood(m.v)}
                            aria-pressed={initialMood === m.v}
                            className={initialMood === m.v ? "selected" : ""}
                          >
                            <Face value={m.v} />
                            <span>{m.label}</span>
                          </button>
                        ))}
                      </div>
                      <button
                        className="primary-button full-width"
                        onClick={() => setEditor("new")}
                      >
                        Write a reflection <ArrowRight size={17} />
                      </button>
                      <small className="panel-note">
                        <ShieldCheck size={12} /> Only visible in your workspace
                      </small>
                    </section>
                    <section className="breathing-panel">
                      <div className="forest-shade" />
                      <div className="breathing-content">
                        <span className="overline">A SMALL RESET</span>
                        <Wind size={28} strokeWidth={1.1} />
                        <h3>
                          Come back
                          <br />
                          to this moment.
                        </h3>
                        <p>A minute of unhurried breathing.</p>
                        <button onClick={() => setBreathing(true)}>
                          Take a breath <ArrowUpRight size={16} />
                        </button>
                      </div>
                    </section>
                    <div className="gentle-note">
                      <span>✳</span>
                      <p>
                        You don’t have to figure
                        <br />
                        everything out today.
                      </p>
                    </div>
                  </aside>
                </div>
              </>
            )}
            {page === "My journal" && (
              <Journal
                entries={entries}
                onEdit={setEditor}
                onNew={() => setEditor("new")}
              />
            )}
            {page === "Patterns" && (
              <Patterns
                analysis={analysis}
                period={period}
                onPeriod={changePeriod}
                onReport={generateReport}
                busy={busy}
                onEntry={(id) => {
                  const entry = entries.find((e) => e.id === id);
                  if (entry) setEditor(entry);
                }}
              />
            )}
            {page === "Reports" && (
              <Reports
                reports={reports}
                onGenerate={generateReport}
                busy={busy}
              />
            )}
            {page === "Companion" && <Companion me={me} />}
            {page === "Settings" && (
              <SettingsView
                me={me}
                onDeleted={() => {
                  setMe(null);
                  setPage("Overview");
                }}
                onToast={setToast}
              />
            )}
          </div>
          <footer className="workspace-footer">
            <span>
              <Sprout size={13} /> Mental Health Wellness · A space for
              self-awareness
            </span>
            <button onClick={() => setHelp(true)}>
              Built for reflection, with care <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      {editor && (
        <EntryEditor
          entry={editor === "new" ? null : editor}
          initialMood={initialMood}
          onClose={() => setEditor(null)}
          onSaved={async (deleted) => {
            setEditor(null);
            await refresh();
            setToast(
              deleted
                ? "Reflection deleted."
                : "Your reflection has been saved.",
            );
          }}
        />
      )}
      {breathing && <Breathing onClose={() => setBreathing(false)} />}
      {help && (
        <Modal title="A little about Still" onClose={() => setHelp(false)}>
          <div className="about-copy">
            <Sprout size={35} />
            <p>
              Still is the Mental Health Wellness project: a space for
              structured journaling and noticing patterns in your own records.
            </p>
            <p>
              Charts and reports describe self-reported data. They are for
              awareness, and do not provide a diagnosis or treatment. AI
              explanations are optional and use OpenRouter.
            </p>
            <p>
              Patterns appear only after minimum evidence thresholds are met.
              Similarity scores and associations can be imperfect. You can
              export your data or delete your account in Settings.
            </p>
            <small>
              BTech final year project · AI Mental Health Awareness Companion
            </small>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Auth({ onComplete }: { onComplete: () => Promise<void> }) {
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

function TrendChart({ analysis }: { analysis: Analysis | null }) {
  const [metric, setMetric] = useState<Metric>("valence");
  // Explicit nulls preserve calendar gaps without inventing unobserved values.
  const dayMap = new Map(analysis?.days.map((d) => [d.date, d]) || []);
  const first = analysis?.days[0]?.date;
  const last = analysis?.days.at(-1)?.date;
  const chartDays =
    first && last
      ? Array.from(
          {
            length:
              Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1,
          },
          (_, i) => {
            const date = new Date(Date.parse(first) + i * 86400000)
              .toISOString()
              .slice(0, 10);
            return (
              dayMap.get(date) || {
                date,
                valence: null,
                stress: null,
                energy: null,
                clarity: null,
              }
            );
          },
        )
      : [];
  return (
    <section className="trend-section">
      <div className="chart-heading">
        <div>
          <h2>Your days, in perspective</h2>
          <p>Every feeling is part of the picture.</p>
        </div>
        <span className="chart-key">
          <span />
          {metricLabels[metric]}
        </span>
      </div>
      <div className="chart-tabs" role="group" aria-label="Chart metric">
        {(Object.keys(metricLabels) as Metric[]).map((m) => (
          <button
            key={m}
            aria-pressed={metric === m}
            className={metric === m ? "active" : ""}
            onClick={() => setMetric(m)}
          >
            {metricLabels[m]}
          </button>
        ))}
      </div>
      {analysis?.days.length ? (
        <div
          className="trend-chart"
          role="img"
          aria-label={`${metricLabels[metric]} across ${analysis.dayCount} observed days. Average ${analysis.averages[metric].toFixed(1)} out of 10.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartDays}
              margin={{ top: 15, right: 10, bottom: 5, left: -30 }}
            >
              <defs>
                <linearGradient id="sage-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6a957a" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#6a957a" stopOpacity={0.015} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 5"
                vertical={false}
                stroke="#e6e9e2"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => dateLabel(d)}
                axisLine={false}
                tickLine={false}
                minTickGap={35}
                tick={{ fontSize: 10, fill: "#82877d" }}
                dy={10}
              />
              <YAxis
                domain={[1, 10]}
                ticks={[1, 4, 7, 10]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#82877d" }}
              />
              <Tooltip
                labelFormatter={(d) => dateLabel(String(d), true)}
                formatter={(value) => [
                  Number(value).toFixed(1),
                  metricLabels[metric],
                ]}
                contentStyle={{
                  borderRadius: 9,
                  border: "1px solid #e4e7df",
                  fontSize: 12,
                  boxShadow: "0 4px 20px #24352a0a",
                }}
              />
              <Area
                type="linear"
                dataKey={metric}
                stroke="#61866d"
                fill="url(#sage-fill)"
                strokeWidth={2}
                dot={analysis.days.length < 10 ? { r: 3 } : false}
                activeDot={{ r: 5, stroke: "#fff", strokeWidth: 3 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Empty icon={TrendingUp} title="Your perspective will take shape">
          Start with a check-in. Your chart grows with each observed day.
        </Empty>
      )}
      <div className="chart-footnote">
        <span>
          <span className="live-dot" />
          {analysis?.dayCount || 0} observed days
        </span>
        <span>Daily averages · 1–10 scale</span>
      </div>
    </section>
  );
}

function Journal({
  entries,
  onEdit,
  onNew,
}: {
  entries: Entry[];
  onEdit: (e: Entry) => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All reflections");
  const filtered = entries.filter(
    (e) =>
      `${e.narrative} ${e.tags.join(" ")} ${e.date}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter !== "This week" ||
        Date.now() - Date.parse(e.date) < 7 * 86400000),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ROOM FOR YOUR EVERYDAY</p>
          <h1>My journal</h1>
          <p>The small moments make up your story.</p>
        </div>
        <button className="primary-button" onClick={onNew}>
          <Plus size={17} />
          New reflection
        </button>
      </div>
      <div className="journal-tools">
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="Search reflections or tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search reflections"
          />
        </label>
        <label className="period-select">
          <SlidersHorizontal size={15} />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Journal date filter"
          >
            <option>All reflections</option>
            <option>This week</option>
          </select>
        </label>
      </div>
      <div className="journal-count">
        {filtered.length} REFLECTION{filtered.length !== 1 ? "S" : ""}
      </div>
      {filtered.length ? (
        <div className="journal-list">
          {filtered.map((entry) => (
            <button
              className="journal-item"
              key={entry.id}
              onClick={() => onEdit(entry)}
            >
              <div className="journal-date">
                <span>
                  {new Date(`${entry.date}T12:00:00`).toLocaleDateString(
                    "en-US",
                    { weekday: "short" },
                  )}
                </span>
                <strong>{new Date(`${entry.date}T12:00:00`).getDate()}</strong>
                <small>
                  {new Date(`${entry.date}T12:00:00`).toLocaleDateString(
                    "en-US",
                    { month: "short", year: "numeric" },
                  )}
                </small>
              </div>
              <div className="journal-body">
                <div className="journal-item-title">
                  <h3>
                    {entry.tags.length
                      ? entry.tags.slice(0, 2).join(" & ")
                      : "A moment to reflect"}
                  </h3>
                  <span className="mood-label">
                    <Face value={entry.valence} size={22} />
                    Mood {entry.valence}/10
                  </span>
                </div>
                <p>
                  {entry.narrative ||
                    "A structured check-in. No written reflection added."}
                </p>
                <div className="journal-meta">
                  <span>Sleep {entry.sleep}h</span>
                  <span>Stress {entry.stress}/10</span>
                  <span>Activity {entry.activity}m</span>
                  {entry.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <Pencil size={16} className="edit-icon" />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title={
            search ? "No matching reflections" : "A blank page, a fresh start"
          }
        >
          {search
            ? "Try another word or clear your filters."
            : "Record your first check-in. You can write as much or as little as you like."}
        </Empty>
      )}
    </>
  );
}

function Patterns({
  analysis,
  period,
  onPeriod,
  onReport,
  busy,
  onEntry,
}: {
  analysis: Analysis | null;
  period: number;
  onPeriod: (p: number) => void;
  onReport: () => void;
  busy: boolean;
  onEntry: (id: string) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">NOTICE, WITHOUT JUDGEMENT</p>
          <h1>Your patterns</h1>
          <p>A closer look at the connections in your everyday.</p>
        </div>
        <button
          className="primary-button"
          onClick={onReport}
          disabled={busy || !analysis?.entryCount}
        >
          <FileText size={16} />
          Create report
        </button>
      </div>
      <div className="pattern-toolbar">
        <span>
          {analysis?.entryCount || 0} reflections · {analysis?.dayCount || 0}{" "}
          observed days
        </span>
        <label className="period-select">
          <select
            value={period}
            onChange={(e) => onPeriod(Number(e.target.value))}
            aria-label="Pattern analysis period"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
          <ChevronDown size={14} />
        </label>
      </div>
      <div className="patterns-layout">
        <div>
          <TrendChart analysis={analysis} />
          <section className="pattern-section">
            <p className="eyebrow">CONNECTIONS IN YOUR ROUTINE</p>
            <h2>Associations with enough evidence</h2>
            {analysis?.findings.length ? (
              analysis.findings.map((f) => (
                <article className="finding" key={f.id}>
                  <span className="evidence-label">
                    <Check size={13} />
                    Passed evidence thresholds
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.detail}</p>
                  <div className="evidence-metadata">
                    <span>r = {f.r.toFixed(2)}</span>
                    <span>
                      99% interval [{f.interval[0].toFixed(2)},{" "}
                      {f.interval[1].toFixed(2)}]
                    </span>
                    <span>n = {f.n} days</span>
                  </div>
                </article>
              ))
            ) : (
              <Empty icon={Sprout} title="Still gathering perspective">
                No associations meet the evidence thresholds for this period.
              </Empty>
            )}
          </section>
          <section className="pattern-section">
            <p className="eyebrow">THREADS THAT RETURN</p>
            <h2>Recurring narrative themes</h2>
            <p className="muted">
              {analysis?.embeddingMethod}. Groups require three reflections on
              different dates.
            </p>
            {analysis?.themes.length ? (
              analysis.themes.map((theme) => (
                <article className="theme-row" key={theme.id}>
                  <div className="theme-count">
                    {theme.count}
                    <small>entries</small>
                  </div>
                  <div>
                    <h3>{theme.label}</h3>
                    <p>
                      {theme.days} dates · Average stress{" "}
                      {theme.averageStress.toFixed(1)}/10
                    </p>
                    <div className="theme-links">
                      {theme.entryIds.slice(0, 3).map((id, i) => (
                        <button
                          className="text-button"
                          key={id}
                          onClick={() => onEntry(id)}
                        >
                          Reflection {i + 1} <ArrowUpRight size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <Empty title="More words, more perspective">
                Similar reflections on three or more dates can form a recurring
                theme.
              </Empty>
            )}
          </section>
        </div>
        <aside className="pattern-context">
          <p className="eyebrow">THE CONTEXT MATTERS</p>
          <h2>Change, in context</h2>
          <div className="drift-number">
            {analysis?.drift ? (
              <>
                {analysis.drift.value >= 0 ? (
                  <ArrowUpRight />
                ) : (
                  <ArrowDownRight />
                )}
                {Math.abs(analysis.drift.value).toFixed(1)}
              </>
            ) : (
              "—"
            )}
          </div>
          <p>
            {analysis?.drift
              ? `Mood points ${analysis.drift.value >= 0 ? "higher" : "lower"} this week. ${analysis.drift.nAfter} days compared with ${analysis.drift.nBefore} last week.`
              : "A weekly comparison will appear after five observed days in each of the last two weeks."}
          </p>
          <hr />
          <h3>Day-to-day variation</h3>
          <strong className="variation-number">
            {analysis?.volatility?.toFixed(2) ?? "—"}
          </strong>
          <p>
            RMSSD of mood, based on {analysis?.consecutivePairs || 0}{" "}
            consecutive-day pairs. A descriptive measure, not a clinical score.
          </p>
          <hr />
          <h3>What we can’t say yet</h3>
          {analysis?.withheld.length ? (
            analysis.withheld.map((text) => (
              <p className="withheld" key={text}>
                {text}
              </p>
            ))
          ) : (
            <p>
              Visible findings passed the configured thresholds. Self-report
              bias and serial dependence still limit interpretation.
            </p>
          )}
          <details>
            <summary>How qualification works</summary>
            <p>
              Associations need 14 observed days, |r| ≥ 0.4, and a 99% Fisher
              interval excluding zero across four predefined comparisons.
              Multiple entries on a date are averaged. Missing dates are not
              filled in. Correlation does not establish cause.
            </p>
          </details>
        </aside>
      </div>
    </>
  );
}

function Reports({
  reports,
  onGenerate,
  busy,
}: {
  reports: Report[];
  onGenerate: () => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const report = reports.find((r) => r.id === selected) || reports[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">STEP BACK. SEE THE WHOLE.</p>
          <h1>Awareness reports</h1>
          <p>A saved perspective on your reflections so far.</p>
        </div>
        <button className="primary-button" onClick={onGenerate} disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Plus size={17} />
          )}
          Generate report
        </button>
      </div>
      {report ? (
        <div className="reports-layout">
          <aside className="report-history">
            <p className="eyebrow">SAVED REPORTS</p>
            {reports.map((r) => (
              <button
                className={r.id === report.id ? "selected" : ""}
                key={r.id}
                onClick={() => setSelected(r.id)}
              >
                <FileText size={18} />
                <span>
                  <strong>{dateLabel(r.createdAt)}</strong>
                  <small>
                    {r.entryCount} reflections ·{" "}
                    {new Date(r.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </aside>
          <article className="report-paper">
            <div className="report-top">
              <Brand />
              <button
                className="secondary-button"
                onClick={() =>
                  download(`still-report-${report.id.slice(0, 8)}.json`, report)
                }
              >
                <Download size={15} />
                Export report
              </button>
            </div>
            <p className="eyebrow">PERSONAL AWARENESS REPORT</p>
            <h2>A moment of perspective.</h2>
            <p>
              Generated {dateLabel(report.createdAt, true)} ·{" "}
              {report.entryCount} reflections across {report.data.dayCount}{" "}
              observed days
            </p>
            <div className="report-stats">
              {(["valence", "stress", "energy", "clarity"] as Metric[]).map(
                (k) => (
                  <div key={k}>
                    <span>{metricLabels[k]}</span>
                    <strong>
                      {report.data.averages[k].toFixed(1)}
                      <small> /10</small>
                    </strong>
                  </div>
                ),
              )}
            </div>
            <h3>Observed associations</h3>
            {report.data.findings.length ? (
              report.data.findings.map((f) => (
                <div className="report-finding" key={f.id}>
                  <h4>{f.title}</h4>
                  <p>
                    {f.detail} 99% interval [{f.interval[0].toFixed(2)},{" "}
                    {f.interval[1].toFixed(2)}].
                  </p>
                </div>
              ))
            ) : (
              <p>
                No associations passed the evidence thresholds in this snapshot.
              </p>
            )}
            <h3>Recurring themes</h3>
            {report.data.themes.length ? (
              report.data.themes.map((t) => (
                <div className="report-theme" key={t.id}>
                  <span>{t.label}</span>
                  <span>
                    {t.count} entries · {t.days} dates
                  </span>
                </div>
              ))
            ) : (
              <p>
                No recurring narrative groups met the minimum occurrence
                threshold.
              </p>
            )}
            <h3>Scope and limitations</h3>
            <p>
              {report.data.embeddingMethod}. Missing dates are not imputed.
              Results describe self-reported observations and cannot establish
              causes or diagnose a condition.
            </p>
            {report.data.withheld.map((w) => (
              <p key={w}>• {w}</p>
            ))}
            <div className="report-end">
              <ShieldCheck size={16} />
              This snapshot stays as it was when generated, even if journal
              entries change.
            </div>
          </article>
        </div>
      ) : (
        <Empty
          icon={FileText}
          title="Your first perspective, ready when you are"
        >
          Add a reflection, then generate a report. Each report saves a snapshot
          of your current records and evidence.
        </Empty>
      )}
    </>
  );
}

function Companion({ me }: { me: Me }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ messages: Message[] }>("companion")
      .then((d) => setMessages(d.messages))
      .catch((e) => setError(e.message));
  }, []);
  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ messages: Message[] }>("companion", "POST", {
        question,
        consent,
      });
      setMessages((prev) => [...prev, ...data.messages]);
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A LITTLE HELP MAKING SENSE OF THINGS</p>
          <h1>Your reflection companion</h1>
          <p>Explore what your recorded patterns mean, in plain language.</p>
        </div>
        <span
          className={`connection-status ${me.aiConfigured ? "connected" : ""}`}
        >
          <span className="live-dot" />
          {me.aiConfigured
            ? "OpenRouter connected"
            : "OpenRouter not connected"}
        </span>
      </div>
      <div className="companion-layout">
        <div className="conversation">
          <div className="companion-intro">
            <span className="companion-logo">
              <Sparkles size={24} />
            </span>
            <h2>
              Let’s put your patterns
              <br />
              into perspective.
            </h2>
            <p>
              I can explain the numbers in your reflections, and help you see
              what the evidence does—and doesn’t—say.
            </p>
            <div className="question-suggestions">
              {[
                "What patterns have enough evidence?",
                "How has my mood changed recently?",
                "What does correlation mean here?",
              ].map((q) => (
                <button key={q} onClick={() => setQuestion(q)}>
                  {q}
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          </div>
          <div className="message-list" aria-live="polite">
            {messages.map((m) => (
              <div className={`message ${m.role}`} key={m.id}>
                <span>
                  {m.role === "assistant" ? (
                    <Sparkles size={17} />
                  ) : (
                    me.user.name[0]
                  )}
                </span>
                <div>
                  <strong>
                    {m.role === "assistant" ? "Still companion" : "You"}
                  </strong>
                  <p>{m.content}</p>
                </div>
              </div>
            ))}
            {busy && (
              <div className="thinking">
                <LoaderCircle size={17} className="spin" />
                Reflecting on the evidence…
              </div>
            )}
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <form className="companion-form" onSubmit={send}>
            <label className="consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Share my question and aggregate statistics with OpenRouter and its
              model provider. My raw journal text is excluded.
            </label>
            <div className="message-input">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about your recorded patterns…"
                maxLength={2000}
                rows={2}
                aria-label="Question for companion"
                required
              />
              <button
                className="primary-button"
                disabled={
                  busy || !consent || !question.trim() || !me.aiConfigured
                }
                aria-label="Send question"
              >
                <Send size={18} />
              </button>
            </div>
            <small>
              AI explanations can make mistakes. Review the evidence in
              Patterns.
            </small>
          </form>
        </div>
        <aside className="companion-aside">
          <ShieldCheck size={27} />
          <h3>You choose what’s shared.</h3>
          <p>
            Your question and numerical summary are sent only when you press
            send. Journal narratives are not included.
          </p>
          <hr />
          <h3>Grounded in your entries</h3>
          <p>
            The companion uses the same qualified statistics you see in
            Patterns. It cannot diagnose or recommend treatment.
          </p>
          {!me.aiConfigured && (
            <div className="setup-note">
              <h3>Connect OpenRouter</h3>
              <p>
                Add your key as <code>OPENROUTER_API_KEY</code> in the server’s{" "}
                <code>.env.local</code> file, then restart.
              </p>
              <p>
                The model defaults to <code>openrouter/free</code>. Your journal
                and reports already work without it.
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function SettingsView({
  me,
  onDeleted,
  onToast,
}: {
  me: Me;
  onDeleted: () => void;
  onToast: (t: string) => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function exportData() {
    try {
      download("still-my-data.json", await api("export"));
      onToast("Your data export is ready.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api("account", "DELETE", { confirm });
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR SPACE, YOUR CHOICES</p>
          <h1>Settings & privacy</h1>
          <p>Know where your data lives and stay in control.</p>
        </div>
      </div>
      <div className="settings-content">
        <section>
          <h2>Your account</h2>
          <dl>
            <div>
              <dt>Name</dt>
              <dd>{me.user.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{me.user.demo ? "Temporary demo account" : me.user.email}</dd>
            </div>
            <div>
              <dt>Workspace</dt>
              <dd>{me.user.demo ? "Synthetic sample records" : "Personal"}</dd>
            </div>
          </dl>
        </section>
        <section>
          <h2>Storage & AI</h2>
          <dl>
            <div>
              <dt>Database</dt>
              <dd>
                {me.database === "sqlite"
                  ? "SQLite · persistent server storage"
                  : "PostgreSQL + pgvector"}
              </dd>
            </div>
            <div>
              <dt>Narrative analysis</dt>
              <dd>
                {me.embeddingMode === "semantic"
                  ? "Local MiniLM embeddings"
                  : "Local lexical vectors"}
              </dd>
            </div>
            <div>
              <dt>AI provider</dt>
              <dd>
                OpenRouter · {me.aiConfigured ? "Connected" : "Not configured"}
              </dd>
            </div>
            <div>
              <dt>Explanation model</dt>
              <dd>{me.model}</dd>
            </div>
          </dl>
          <p className="muted">
            Your password is hashed. Journals are stored in the server database,
            not in browser storage. Protect the server disk and backups.
            Optional AI requests share your question and aggregate statistics.
          </p>
        </section>
        <section>
          <h2>Take your reflections with you</h2>
          <p>
            Download your entries, saved reports, and companion history as JSON.
          </p>
          <button className="secondary-button" onClick={exportData}>
            <Download size={16} />
            Export my data
          </button>
        </section>
        <section className="danger-section">
          <h2>Delete your workspace</h2>
          <p>
            This permanently deletes your account, reflections, saved reports,
            and companion messages. Download an export first if you want a copy.
          </p>
          <label>
            Type DELETE to confirm
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </label>
          <button
            className="danger-button"
            disabled={confirm !== "DELETE" || busy}
            onClick={remove}
          >
            <Trash2 size={16} />
            Delete my account and data
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function Modal({
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
        ];
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

function EntryEditor({
  entry,
  initialMood,
  onClose,
  onSaved,
}: {
  entry: Entry | null;
  initialMood: number;
  onClose: () => void;
  onSaved: (deleted?: boolean) => Promise<void>;
}) {
  const [form, setForm] = useState({
    date: entry?.date || today(),
    valence: entry?.valence || initialMood,
    stress: entry?.stress || 5,
    energy: entry?.energy || 5,
    clarity: entry?.clarity || 5,
    sleep: entry?.sleep ?? 7,
    workload: entry?.workload || 5,
    activity: entry?.activity ?? 30,
    narrative: entry?.narrative || "",
    tags: entry?.tags || ([] as string[]),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const tags = [
    "Studies",
    "Work",
    "Friends",
    "Family",
    "Movement",
    "Outdoors",
    "Rest",
    "Deadlines",
  ];
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        entry ? `entries/${entry.id}` : "entries",
        entry ? "PATCH" : "POST",
        form,
      );
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`entries/${entry!.id}`, "DELETE");
      await onSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={entry ? "Your reflection" : "A moment to check in"}
      onClose={onClose}
      wide
    >
      <form className="entry-form" onSubmit={save}>
        <div className="entry-form-intro">
          <p>No perfect words needed. Start wherever you are.</p>
          <label className="date-input">
            Date
            <input
              type="date"
              value={form.date}
              min="2000-01-01"
              max={today()}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </label>
        </div>
        <div className="metric-inputs">
          {(["valence", "stress", "energy", "clarity"] as Metric[]).map(
            (metric) => (
              <label className="slider-label" key={metric}>
                <span>
                  {metricLabels[metric]}
                  <strong>
                    {form[metric]}
                    <small>/10</small>
                  </strong>
                </span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={form[metric]}
                  onChange={(e) =>
                    setForm({ ...form, [metric]: Number(e.target.value) })
                  }
                />
                <small>
                  {metric === "valence"
                    ? "Low mood"
                    : metric === "stress"
                      ? "Very calm"
                      : "Very low"}
                  <span>
                    {metric === "valence"
                      ? "Great mood"
                      : metric === "stress"
                        ? "Very stressed"
                        : "Very high"}
                  </span>
                </small>
              </label>
            ),
          )}
        </div>
        <div className="context-inputs">
          <label>
            Sleep (hours)
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              required
              value={form.sleep}
              onChange={(e) =>
                setForm({ ...form, sleep: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Workload (1–10)
            <input
              type="number"
              min={1}
              max={10}
              required
              value={form.workload}
              onChange={(e) =>
                setForm({ ...form, workload: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Activity (minutes)
            <input
              type="number"
              min={0}
              max={1440}
              required
              value={form.activity}
              onChange={(e) =>
                setForm({ ...form, activity: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <label className="narrative-label">
          What’s on your mind?
          <textarea
            rows={4}
            maxLength={6000}
            value={form.narrative}
            onChange={(e) => setForm({ ...form, narrative: e.target.value })}
            placeholder="A moment from your day, something that stayed with you, or simply how things feel…"
          />
          <small>{form.narrative.length}/6000 · Optional</small>
        </label>
        <fieldset className="tag-field">
          <legend>What was part of your day?</legend>
          <div>
            {[...new Set([...tags, ...form.tags])].map((tag) => (
              <button
                type="button"
                className={`tag-option ${form.tags.includes(tag) ? "selected" : ""}`}
                aria-pressed={form.tags.includes(tag)}
                key={tag}
                onClick={() =>
                  setForm({
                    ...form,
                    tags: form.tags.includes(tag)
                      ? form.tags.filter((t) => t !== tag)
                      : form.tags.length < 8
                        ? [...form.tags, tag]
                        : form.tags,
                  })
                }
              >
                {form.tags.includes(tag) && <Check size={12} />} {tag}
              </button>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {deleting && (
          <div className="delete-confirm">
            <p>
              Permanently delete this reflection? Previously generated reports
              keep their saved snapshots.
            </p>
            <button
              type="button"
              className="danger-button"
              onClick={remove}
              disabled={busy}
            >
              Delete reflection
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setDeleting(false)}
            >
              Keep it
            </button>
          </div>
        )}
        <div className="editor-actions">
          {entry ? (
            <button
              type="button"
              className="icon-button danger-text"
              onClick={() => setDeleting(true)}
              aria-label="Delete reflection"
            >
              <Trash2 size={18} />
            </button>
          ) : (
            <span className="muted">
              <ShieldCheck size={13} />
              Your private reflection
            </span>
          )}
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="primary-button" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Check size={17} />
              )}
              Save reflection
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Breathing({ onClose }: { onClose: () => void }) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(
      () =>
        setSeconds((s) => {
          if (s >= 59) {
            setRunning(false);
            return 60;
          }
          return s + 1;
        }),
      1000,
    );
    return () => clearInterval(interval);
  }, [running]);
  const label =
    seconds === 60
      ? "A moment, just for you."
      : running
        ? seconds % 10 < 4
          ? "Breathe in"
          : "Breathe out"
        : "Find a comfortable pace";
  return (
    <Modal title="One quiet minute" onClose={onClose}>
      <div className="breathing-exercise">
        <div className={`breath-orbit ${running ? "running" : ""}`}>
          <Wind size={42} strokeWidth={1} />
        </div>
        <h3 aria-live="polite">{label}</h3>
        <p>
          Follow the circle if it feels comfortable.
          <br />
          You can stop whenever you like.
        </p>
        <span className="breath-timer">
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:
          {String(seconds % 60).padStart(2, "0")} / 01:00
        </span>
        <button
          className="primary-button"
          onClick={() => {
            if (seconds === 60) setSeconds(0);
            setRunning(!running);
          }}
        >
          {running
            ? "Pause"
            : seconds === 60
              ? "Start again"
              : seconds
                ? "Continue"
                : "Begin a quiet minute"}
        </button>
      </div>
    </Modal>
  );
}
