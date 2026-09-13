"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  BookOpen,
  FileText,
  LayoutGrid,
  TrendingUp,
  Settings,
  Plus,
  Menu,
  LogOut,
  ChevronRight,
  ShieldCheck,
  ArrowRight,
  Download,
  Pencil,
  Trash2,
  LoaderCircle,
  X,
} from "lucide-react";
import type { Entry, User, Report } from "@/lib/types";
import {
  CONSENT,
  dimensions,
  labels,
  type Preferences,
  type Job,
  type Period,
  type JournalReport,
} from "@/lib/journal/schema";
import {
  api,
  Auth,
  Brand,
  Modal,
  download,
  dateInZone,
  shiftDate,
} from "./journal-ui";
import { Insights } from "./journal-insights";
type Page = "Overview" | "My journal" | "Patterns" | "Reports" | "Settings";
type Me = {
  user: User;
  aiConfigured: boolean;
  model: string;
  database: string;
  preferences: Preferences;
};
type Snapshot = {
  status: string;
  period: Period | null;
  job: Job | null;
  entryCount: number;
  observedDays: number;
};
type AnyReport = Report | JournalReport;
const isAI = (r: AnyReport): r is JournalReport =>
  "kind" in r && r.kind === "journal-ai";
const nav = [
  { name: "Overview", icon: LayoutGrid },
  { name: "My journal", icon: BookOpen },
  { name: "Patterns", icon: TrendingUp },
  { name: "Reports", icon: FileText },
  { name: "Settings", icon: Settings },
] as const;
export default function Workspace() {
  const [me, setMe] = useState<Me | null>(null),
    [boot, setBoot] = useState(true),
    [page, setPage] = useState<Page>("Overview");
  const [entries, setEntries] = useState<Entry[]>([]),
    [reports, setReports] = useState<AnyReport[]>([]),
    [jobs, setJobs] = useState<Job[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [rangeDays, setRangeDays] = useState(30),
    [rangeEnd, setRangeEnd] = useState("");
  const [editor, setEditor] = useState<Entry | "new" | null>(null),
    [selected, setSelected] = useState<AnyReport | null>(null),
    [deletedEvidence, setDeletedEvidence] = useState("");
  const [menu, setMenu] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const serial = useRef(0);
  const end = rangeEnd || dateInZone(me?.preferences.timezone || "UTC"),
    start = shiftDate(end, 1 - rangeDays);
  async function loadMe() {
    setMe(await api<Me>("me"));
  }
  async function refresh() {
    const token = ++serial.current;
    const [e, a, r, j] = await Promise.all([
      api<{ entries: Entry[] }>("entries"),
      api<Snapshot>(`analytics?start=${start}&end=${end}`),
      api<{ reports: AnyReport[] }>("reports"),
      api<{ jobs: Job[] }>("jobs"),
    ]);
    if (token !== serial.current) return;
    setEntries(e.entries);
    setSnapshot(a);
    setReports(r.reports);
    setJobs(j.jobs);
  }
  useEffect(() => {
    loadMe()
      .catch(() => {})
      .finally(() => setBoot(false));
  }, []);
  useEffect(() => {
    if (me) {
      setSnapshot(null);
      refresh().catch((e) => setError(e.message));
    }
    return () => {
      serial.current++;
    };
  }, [me?.user.id, start, end, me?.preferences.revision]);
  const pending = jobs.some((j) => ["queued", "running"].includes(j.status));
  useEffect(() => {
    if (!me || !pending) return;
    const timer = setInterval(
      () => refresh().catch((e) => setError(e.message)),
      4000,
    );
    return () => clearInterval(timer);
  }, [pending, me?.user.id, start, end]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    await action(async () => {
      await api("auth/logout", "POST", {});
      setPage("Overview");
      setMenu(false);
      setMe(null);
      setEntries([]);
      setReports([]);
      setJobs([]);
      setSnapshot(null);
      setSelected(null);
      setEditor(null);
    });
  }
  async function generate(report = false) {
    await action(async () => {
      const result = await api<{ job: Job | null }>(
        report ? "reports" : "analysis",
        "POST",
        { start, end },
      );
      await refresh();
      setToast(
        result.job
          ? "Queued for the server worker. You can close this page."
          : "There are no journal entries in this range.",
      );
      if (report) setPage("Reports");
    });
  }
  function openEntry(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (entry) {
      setSelected(null);
      setEditor(entry);
      return;
    }
    const periods = [
      snapshot?.period,
      ...reports.filter(isAI).map((r) => r.period),
    ].filter((p): p is Period => !!p);
    const text = periods
      .flatMap((p) => p.days)
      .flatMap((d) => d.sources)
      .filter((s) => s.entryId === id);
    setSelected(null);
    setDeletedEvidence(
      text.length
        ? [...new Map(text.map((s) => [s.sourceId, s.text])).values()].join(
            "\n\n",
          )
        : "This entry is no longer available. The quoted excerpt remains in the historical report.",
    );
  }
  if (boot)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" /> Opening your journal…
      </div>
    );
  if (!me) return <Auth onComplete={loadMe} />;
  const canAnalyze =
    me.preferences.consentVersion === CONSENT && me.aiConfigured;
  const navigate = (next: Page) => {
    setPage(next);
    setMenu(false);
    setError("");
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <Brand />
        <span className="sidebar-caption">YOUR JOURNAL, IN PERSPECTIVE</span>
        <nav aria-label="Main navigation">
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              aria-current={page === name ? "page" : undefined}
              onClick={() => navigate(name)}
            >
              <Icon size={19} />
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-note">
            <BookOpen size={23} />
            <p>Your words come first.</p>
            <span>AI reflection is always optional.</span>
          </div>
          <div className="profile">
            <span className="avatar">
              {me.user.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{me.user.name}</strong>
              <small>
                {me.user.demo ? "Sample workspace" : "Personal workspace"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={signOut}
            >
              <LogOut size={18} />
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
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span>My workspace</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <span className="privacy-label">
            <ShieldCheck size={15} /> Your sharing choices matter
          </span>
        </header>
        <main className="workspace journal-first" id="main-content">
          {me.user.demo && (
            <div className="demo-banner">
              Sample reflections, not real wellbeing measurements. AI analysis
              is not pre-generated.
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
          <div className="page-heading">
            <div>
              <p className="eyebrow">STILL / JOURNAL & REFLECTION</p>
              <h1>{page === "Overview" ? "Journal overview" : page}</h1>
              <p>
                {page === "My journal"
                  ? "Write freely. A sentence or a few paragraphs is enough."
                  : page === "Settings"
                    ? "Control your timezone, sharing permissions and saved data."
                    : page === "Reports"
                      ? "Saved reflections for a selected period, with the evidence behind them."
                      : "Narrative-led estimates, with gaps and uncertainty left visible."}
              </p>
            </div>
            <button className="primary-button" onClick={() => setEditor("new")}>
              <Plus size={17} /> Write an entry
            </button>
          </div>
          {["Overview", "Patterns", "Reports"].includes(page) && (
            <div className="range-toolbar">
              <label>
                Range
                <select
                  aria-label="Analysis range"
                  value={rangeDays}
                  onChange={(e) => setRangeDays(Number(e.target.value))}
                >
                  <option value={7}>Week · 7 days</option>
                  <option value={30}>Month · 30 days</option>
                  <option value={365}>Year · 365 days</option>
                </select>
              </label>
              <label>
                Ending on
                <input
                  type="date"
                  value={end}
                  max={dateInZone(me.preferences.timezone)}
                  onChange={(e) =>
                    e.target.value && setRangeEnd(e.target.value)
                  }
                />
              </label>
              <span>
                {start} — {end}
                <small>{me.preferences.timezone}</small>
              </span>
              <button
                className="secondary-button"
                disabled={busy || !canAnalyze}
                onClick={() => generate(page === "Reports")}
              >
                {page === "Reports" ? "Generate report" : "Analyze this range"}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {["Overview", "Patterns"].includes(page) && (
            <div className="page-enter">
              {snapshot ? (
                <>
                  <AnalysisStatus
                    snapshot={snapshot}
                    configured={me.aiConfigured}
                    onSettings={() => navigate("Settings")}
                    onRetry={() =>
                      snapshot.job
                        ? action(async () => {
                            await api(
                              `jobs/${snapshot.job!.id}/retry`,
                              "POST",
                              {},
                            );
                            await refresh();
                          })
                        : generate()
                    }
                    busy={busy}
                  />
                  {snapshot.period && (
                    <Insights
                      period={snapshot.period}
                      onEntry={openEntry}
                      patternsOnly={page === "Patterns"}
                    />
                  )}
                </>
              ) : (
                <p role="status">Loading saved analysis…</p>
              )}
              {!snapshot?.period && (
                <section className="journal-start">
                  <BookOpen size={30} strokeWidth={1.2} />
                  <h2>Your journal is the starting point</h2>
                  <p>
                    Save what happened, what felt difficult and anything that
                    helped. Ratings are optional. Analysis will not invent
                    scores for missing evidence.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => navigate("My journal")}
                  >
                    Open my journal <ArrowRight size={15} />
                  </button>
                </section>
              )}
            </div>
          )}
          {page === "My journal" && (
            <>
              <JobList
                jobs={jobs.filter((j) => j.kind === "daily")}
                onRetry={(id) =>
                  action(async () => {
                    await api(`jobs/${id}/retry`, "POST", {});
                    await refresh();
                  })
                }
                busy={busy}
              />
              <Journal
                entries={entries}
                onEdit={setEditor}
                onDelete={(e) =>
                  action(async () => {
                    if (
                      !confirm(
                        "Delete this journal entry? Live analysis will be invalidated. Saved reports retain historical excerpts until you delete those reports separately.",
                      )
                    )
                      return;
                    await api(`entries/${e.id}`, "DELETE");
                    await refresh();
                    setToast(
                      "Entry deleted. Historical report copies are unchanged.",
                    );
                  })
                }
              />
            </>
          )}
          {page === "Reports" && (
            <div className="page-enter">
              <p className="method-note">
                Reports are immutable snapshots. Regenerating creates a new
                revision; valid daily caches are reused, but period synthesis
                runs again. Deleting a journal entry does not remove historical
                report excerpts.
              </p>
              {!canAnalyze && (
                <p className="status-panel">
                  {me.preferences.consentVersion !== CONSENT
                    ? "Allow journal-content sharing in Settings to generate reports."
                    : "The server needs an AI provider key before it can generate reports."}
                </p>
              )}
              <JobList
                jobs={jobs.filter(
                  (j) => j.kind !== "daily" && j.kind !== "overview",
                )}
                onRetry={(id) =>
                  action(async () => {
                    await api(`jobs/${id}/retry`, "POST", {});
                    await refresh();
                  })
                }
                busy={busy}
              />
              {!reports.length && (
                <div className="empty">
                  <FileText size={28} />
                  <h3>No saved reports yet</h3>
                  <p>
                    Select a range and generate your first report. A running
                    server worker is required.
                  </p>
                </div>
              )}
              {reports.map((r) => (
                <article className="report-list-row" key={r.id}>
                  <FileText size={23} />
                  <div>
                    <h3>
                      {isAI(r)
                        ? `${r.period.start} — ${r.period.end}`
                        : "Legacy self-report snapshot"}
                    </h3>
                    <p>
                      {new Date(r.createdAt).toLocaleString()} · {r.entryCount}{" "}
                      entries · {isAI(r) ? r.origin : "Not journal-AI analysis"}
                    </p>
                    <small>Revision {r.id.slice(0, 8)}</small>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => setSelected(r)}
                  >
                    Open
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Download report JSON"
                    onClick={() => download(`still-report-${r.id}.json`, r)}
                  >
                    <Download size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Delete report"
                    onClick={() =>
                      action(async () => {
                        if (
                          !confirm(
                            "Permanently delete this saved report and its historical excerpts? Other reports and your journal will remain.",
                          )
                        )
                          return;
                        await api(`reports/${r.id}`, "DELETE");
                        await refresh();
                        setToast(
                          "Report deleted. It cannot be recovered unless you exported a copy.",
                        );
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </article>
              ))}
            </div>
          )}
          {page === "Settings" && (
            <PreferencesView
              me={me}
              busy={busy}
              onSave={(value) =>
                action(async () => {
                  await api("preferences", "PATCH", value);
                  await loadMe();
                  setToast(
                    "Sharing preferences saved. Pending work under the old permissions was cancelled.",
                  );
                })
              }
              onExport={() =>
                action(async () =>
                  download("still-my-data.json", await api("export")),
                )
              }
              onDelete={() =>
                action(async () => {
                  if (
                    prompt(
                      "This permanently deletes your account, journal, reports, analysis, preferences and historical messages. Type DELETE to continue.",
                    ) !== "DELETE"
                  )
                    return;
                  await api("account", "DELETE", { confirm: "DELETE" });
                  setMe(null);
                  setEntries([]);
                  setReports([]);
                  setJobs([]);
                  setSnapshot(null);
                })
              }
            />
          )}
          <footer className="workspace-footer">
            <span>
              <ShieldCheck size={14} /> A self-awareness tool, not a diagnosis
              or treatment.
            </span>
            <span>
              If you are in immediate danger, contact local emergency services
              and someone you trust. This journal is not monitored.
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {editor && (
        <Modal
          title={editor === "new" ? "Write an entry" : "Edit journal entry"}
          onClose={() => setEditor(null)}
          wide
        >
          <EntryEditor
            entry={editor === "new" ? null : editor}
            timezone={me.preferences.timezone}
            onSave={async (values) => {
              await api(
                editor === "new" ? "entries" : `entries/${editor.id}`,
                editor === "new" ? "POST" : "PATCH",
                values,
              );
              setEditor(null);
              await refresh();
              setToast(
                me.preferences.autoDaily
                  ? "Journal saved. Daily analysis was queued separately."
                  : "Journal saved. No automatic AI analysis requested.",
              );
            }}
          />
        </Modal>
      )}
      {selected && (
        <Modal
          title={
            isAI(selected)
              ? "Journal reflection report"
              : "Legacy self-report report"
          }
          onClose={() => setSelected(null)}
          wide
        >
          <div className="report-actions">
            <button
              className="secondary-button"
              onClick={() =>
                download(`still-report-${selected.id}.json`, selected)
              }
            >
              Download JSON
            </button>
            <button className="secondary-button" onClick={() => window.print()}>
              Print / Save PDF
            </button>
          </div>
          <p>
            Saved {new Date(selected.createdAt).toLocaleString()} · revision{" "}
            {selected.id}
          </p>
          {isAI(selected) ? (
            <Insights period={selected.period} onEntry={openEntry} />
          ) : (
            <>
              <p className="status-panel">
                Legacy report: numeric self-reports and older statistical
                analysis. This is not journal-derived AI analysis.
              </p>
              <p>
                {selected.data.dayCount} observed days · {selected.entryCount}{" "}
                entries
              </p>
              <h3>Historical entries</h3>
              {selected.entries.map((e) => (
                <article className="journal-entry" key={e.id}>
                  <h3>{e.date}</h3>
                  <p>{e.narrative}</p>
                  <small>
                    Original ratings: emotional tone {e.valence}, stress{" "}
                    {e.stress}, energy {e.energy}, clarity {e.clarity}
                  </small>
                </article>
              ))}
              <details>
                <summary>Original analysis</summary>
                <pre>{JSON.stringify(selected.data, null, 2)}</pre>
              </details>
            </>
          )}
        </Modal>
      )}
      {deletedEvidence && (
        <Modal
          title="Historical journal excerpt"
          onClose={() => setDeletedEvidence("")}
        >
          <p className="method-note">
            The live entry has been deleted. This is the preserved report copy,
            not an editable journal record.
          </p>
          <p className="preserve-text">{deletedEvidence}</p>
        </Modal>
      )}
    </div>
  );
}
function AnalysisStatus({
  snapshot: s,
  configured,
  onSettings,
  onRetry,
  busy,
}: {
  snapshot: Snapshot;
  configured: boolean;
  onSettings: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const descriptions: Record<string, string> = {
    "insufficient-evidence":
      "The journal was analyzed, but there is not enough evidence or explicit ratings for numerical estimates. Unsupported scores remain blank.",
    "consent-needed":
      "Your journal is saved privately in this account. Choose whether OpenRouter and Google Gemini may receive journal text for reflection.",
    "not-configured":
      "AI providers are not configured on the server. Journal saving works without AI.",
    "not-analyzed":
      "No saved analysis for this range. Analyze it when you are ready.",
    queued:
      "Analysis is queued. The server worker continues independently of this page.",
    generating:
      "The worker is reading every observed day and validating evidence.",
    ready: "Saved analysis is up to date for this journal revision.",
    stale:
      "This is an older snapshot. Your journal or preferences changed; regenerate before treating it as current.",
    insufficient:
      "No journal entries in this range. Missing days are not filled with estimated scores.",
    failed:
      "Analysis could not finish. Your entries are safe; unavailable AI is not insufficient narrative evidence.",
  };
  return (
    <section className={`status-panel status-${s.status}`} role="status">
      <div>
        <strong>{s.status.replaceAll("-", " ")}</strong>
        <p>{descriptions[s.status]}</p>
        {s.job && s.status !== "consent-needed" && (
          <small>
            {s.job.progress}
            {s.job.error ? ` · ${s.job.error}` : ""}
          </small>
        )}
        {s.status === "queued" && (
          <p className="muted">
            Local setup: run npm run worker in a separate terminal.
          </p>
        )}
      </div>
      {s.status === "consent-needed" && (
        <button className="secondary-button" onClick={onSettings}>
          Review sharing
        </button>
      )}
      {["failed", "stale"].includes(s.status) && configured && (
        <button className="secondary-button" disabled={busy} onClick={onRetry}>
          Retry analysis
        </button>
      )}
    </section>
  );
}
function Journal({
  entries,
  onEdit,
  onDelete,
}: {
  entries: Entry[];
  onEdit: (e: Entry) => void;
  onDelete: (e: Entry) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = [...entries]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
    )
    .filter((e) =>
      (e.narrative + " " + e.date + " " + e.tags.join(" "))
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  return (
    <section className="journal-list">
      <label className="journal-search">
        Search your journal
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="A word, date or tag…"
        />
      </label>
      <p className="muted">
        {filtered.length} entries · Multiple entries on the same date form one
        analyzed day.
      </p>
      {filtered.map((e) => (
        <article className="journal-entry" key={e.id}>
          <div className="section-title">
            <h2>{e.date}</h2>
            <div>
              <button
                className="icon-button"
                aria-label={`Edit entry ${e.date}`}
                onClick={() => onEdit(e)}
              >
                <Pencil size={17} />
              </button>
              <button
                className="icon-button"
                aria-label={`Delete entry ${e.date}`}
                onClick={() => onDelete(e)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
          <p className="preserve-text">
            {e.narrative || "No narrative supplied in this historical entry."}
          </p>
          <details className="evidence">
            <summary>Original optional observations</summary>
            <p>
              {dimensions
                .map((k) => `${labels[k]}: ${e[k] ?? "not supplied"}`)
                .join(" · ")}
            </p>
            <p>
              Sleep: {e.sleep ?? "not supplied"} hours · Activity:{" "}
              {e.activity ?? "not supplied"} minutes · Workload:{" "}
              {e.workload ?? "not supplied"}
            </p>
            <p>Tags: {e.tags.join(", ") || "none"}</p>
          </details>
        </article>
      ))}
      {!filtered.length && (
        <div className="empty">
          <BookOpen size={28} />
          <h3>
            {entries.length ? "No matching entries" : "Start with a few words"}
          </h3>
          <p>There is no required length or mood rating.</p>
        </div>
      )}
    </section>
  );
}
function EntryEditor({
  entry,
  timezone,
  onSave,
}: {
  entry: Entry | null;
  timezone: string;
  onSave: (value: unknown) => Promise<void>;
}) {
  const [text, setText] = useState(entry?.narrative || ""),
    [date, setDate] = useState(entry?.date || dateInZone(timezone)),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      const ratings = Object.fromEntries(
        [...dimensions, "sleep", "activity", "workload"].map((k) => {
          const v = form.get(k);
          return [k, v === "" || v === null ? null : Number(v)];
        }),
      );
      await onSave({
        date,
        narrative: text,
        tags: String(form.get("tags") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        ...ratings,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="journal-editor" onSubmit={submit}>
      <label>
        Journal date
        <input
          type="date"
          required
          value={date}
          max={dateInZone(timezone)}
          min="2000-01-01"
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <small>
        {timezone} · This date stays as chosen, even if you change timezone
        later.
      </small>
      <label>
        What would you like to write?
        <textarea
          autoFocus
          rows={10}
          maxLength={60000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What happened today? How did it feel? What helped, or stayed on your mind?"
        />
      </label>
      <small>
        {text.length.toLocaleString()} / 60,000 characters · Short entries are
        welcome. Every paragraph is included when analyzed.
      </small>
      <details className="optional-ratings">
        <summary>Optional ratings & factual observations</summary>
        <p>
          Leave a field blank if you did not rate it. Nothing is preselected.
          These ratings do not guide narrative scoring.
        </p>
        <div className="ratings-fields">
          {dimensions.map((k) => (
            <label key={k}>
              {labels[k]}
              {k === "stress" ? " (higher = more stress)" : ""}
              <input
                name={k}
                type="number"
                min={1}
                max={10}
                step={1}
                defaultValue={entry?.[k] ?? ""}
                placeholder="Not supplied"
              />
            </label>
          ))}
          <label>
            Sleep (hours)
            <input
              name="sleep"
              type="number"
              min={0}
              max={24}
              step={0.1}
              defaultValue={entry?.sleep ?? ""}
              placeholder="Not supplied"
            />
          </label>
          <label>
            Activity (minutes)
            <input
              name="activity"
              type="number"
              min={0}
              max={1440}
              step={1}
              defaultValue={entry?.activity ?? ""}
              placeholder="Not supplied"
            />
          </label>
          <label>
            Workload (1–10)
            <input
              name="workload"
              type="number"
              min={1}
              max={10}
              step={1}
              defaultValue={entry?.workload ?? ""}
              placeholder="Not supplied"
            />
          </label>
        </div>
      </details>
      <label>
        Tags (optional, comma separated)
        <input
          name="tags"
          defaultValue={entry?.tags.join(", ") || ""}
          maxLength={247}
          placeholder="e.g. college, outdoors"
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="editor-footer">
        <span>Saving does not depend on AI availability.</span>
        <button className="primary-button" disabled={saving}>
          {saving ? "Saving…" : "Save journal entry"}
        </button>
      </div>
    </form>
  );
}
function JobList({
  jobs,
  onRetry,
  busy,
}: {
  jobs: Job[];
  onRetry: (id: string) => void;
  busy: boolean;
}) {
  return (
    <section aria-label="Analysis jobs">
      {jobs
        .filter((j) => j.status !== "succeeded")
        .map((j) => (
          <div className="job-row" key={j.id}>
            <div>
              <strong>
                {j.start_date} — {j.end_date} · {j.status}
              </strong>
              <p>
                {j.progress} {j.error && `· ${j.error}`}
              </p>
              <small>
                {j.kind} · attempt {j.attempts}
              </small>
            </div>
            {["failed", "cancelled"].includes(j.status) && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => onRetry(j.id)}
              >
                Retry
              </button>
            )}
          </div>
        ))}
    </section>
  );
}
function PreferencesView({
  me,
  busy,
  onSave,
  onExport,
  onDelete,
}: {
  me: Me;
  busy: boolean;
  onSave: (value: unknown) => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const [sharing, setSharing] = useState(
    me.preferences.consentVersion === CONSENT,
  );
  return (
    <div className="preferences-view">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSave({
            timezone: f.get("timezone"),
            consentVersion: sharing ? CONSENT : null,
            autoDaily: sharing && f.get("autoDaily") === "on",
            weekly: sharing && f.get("weekly") === "on",
            monthly: sharing && f.get("monthly") === "on",
          });
        }}
      >
        <section>
          <h2>Journal-content sharing</h2>
          <p>
            Analysis sends journal paragraphs, dates, evidence excerpts and
            derived summaries to OpenRouter and its routed provider first, with
            Google Gemini as the fallback. Daily narrative scoring excludes
            separate form ratings; period reflection also receives the final
            scores and statistics. Provider privacy and retention policies
            apply. Models may be unavailable or rate-limited.
          </p>
          <p>
            Your journal saves to {me.database}. No API key is sent to your
            browser.{" "}
            {me.aiConfigured
              ? "AI providers are configured."
              : "AI providers are not configured; set the server environment key."}
          </p>
          <label className="consent-choice">
            <input
              type="checkbox"
              checked={sharing}
              onChange={(e) => setSharing(e.target.checked)}
            />{" "}
            I allow my journal content to be shared for AI reflection.
          </label>
          <small>
            Consent version {CONSENT} · Previous OpenRouter or aggregate-only
            permission does not authorize journal sharing.
          </small>
        </section>
        <section>
          <h2>When analysis runs</h2>
          <label className="consent-choice">
            <input
              type="checkbox"
              name="autoDaily"
              disabled={!sharing}
              defaultChecked={me.preferences.autoDaily}
            />{" "}
            Analyze a day automatically when I save or change an entry
          </label>
          <label className="consent-choice">
            <input
              type="checkbox"
              name="weekly"
              disabled={!sharing}
              defaultChecked={me.preferences.weekly}
            />{" "}
            Generate reports for completed Monday–Sunday weeks
          </label>
          <label className="consent-choice">
            <input
              type="checkbox"
              name="monthly"
              disabled={!sharing}
              defaultChecked={me.preferences.monthly}
            />{" "}
            Generate reports for completed calendar months
          </label>
          <p>
            Scheduling includes at most the two most recent completed weeks or
            months, including earlier journal entries. Scheduled work requires a
            running server worker. Saving revoked permissions cancels pending
            work and prevents late results from being written. Already shared
            content cannot be recalled from providers; saved reports remain
            until deleted.
          </p>
        </section>
        <section>
          <h2>Calendar timezone</h2>
          <label>
            IANA timezone
            <input
              name="timezone"
              required
              defaultValue={me.preferences.timezone}
              list="timezone-options"
            />
            <datalist id="timezone-options">
              {[
                ...new Set([
                  "UTC",
                  "Asia/Kolkata",
                  Intl.DateTimeFormat().resolvedOptions().timeZone,
                  "America/New_York",
                  "Europe/London",
                ]),
              ].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <p>
            Controls new-entry dates and scheduled calendar boundaries. Existing
            date-only entries do not move.
          </p>
        </section>
        <button className="primary-button" disabled={busy}>
          Save preferences
        </button>
      </form>
      <section>
        <h2>Your data</h2>
        <p>
          Export includes entries, original ratings, historical messages,
          reports, daily and period analyses, jobs, and sharing preferences.
          Deleting your account removes all of these from this application's
          database.
        </p>
        <div className="report-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={onExport}
          >
            <Download size={16} /> Export all data
          </button>
          <button className="danger-button" disabled={busy} onClick={onDelete}>
            Delete account
          </button>
        </div>
      </section>
      <section>
        <h2>How to read the estimates</h2>
        <p>
          All dimensions use 1–10 anchors. Emotional tone: very unpleasant to
          very pleasant; stress: little pressure to overwhelming pressure;
          energy: exhausted to highly energized; clarity: confused to very
          clear; connection: isolated to deeply connected; motivation: little
          drive to strong drive; calmness: agitated to deeply settled;
          self-compassion: harsh toward self to deeply kind toward self. A
          midpoint means mixed evidence, not missing evidence.
        </p>
        <p>
          Strength labels describe textual support, not a probability. These
          estimates have not been clinically validated. Patterns describe this
          journal, not your identity, a diagnosis, or a causal explanation.
        </p>
        <p>
          Reflection principles adapted from{" "}
          <a
            href="https://github.com/MetcalfSolutions/Satori"
            target="_blank"
            rel="noreferrer"
          >
            MetcalfSolutions/Satori
          </a>
          , Apache 2.0. No diagnostic or personality-modeling instructions are
          used.
        </p>
      </section>
    </div>
  );
}
