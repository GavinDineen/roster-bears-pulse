"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PulsePayload } from "@/lib/types";
import type { QueueFile } from "@/lib/queue-types";

interface SpendSummary {
  monthSpendUsd: number;
  monthlyBudgetUsd: number;
  remainingUsd: number;
  readsToday: number;
  maxReadsPerDay: number;
  postsToday: number;
  maxPostsPerDay: number;
  lastCollectAt: string | null;
  collectEveryMinutes: number;
}

const POLL_MS = 20_000;
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://therostercollective.com";
const PULSE_PATH = process.env.NEXT_PUBLIC_PULSE_PATH || "/intelligence/bears";

function usd(n: number | undefined): string {
  return `$${(n ?? 0).toFixed(2)}`;
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Page() {
  const [pulse, setPulse] = useState<PulsePayload | null>(null);
  const [queue, setQueue] = useState<QueueFile | null>(null);
  const [spend, setSpend] = useState<SpendSummary | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null
  );
  const busyIds = useRef<Set<string>>(new Set());
  const [, force] = useState(0);

  const refresh = useCallback(async () => {
    // Client ONLY reads these three. Never /api/collect on a timer.
    const [p, q, s] = await Promise.all([
      fetch("/api/pulse", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/queue", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/spend", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setPulse(p);
    setQueue(q);
    setSpend(s);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const collectNow = useCallback(async () => {
    setCollecting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/collect", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setNotice({
          kind: "ok",
          msg: `Collected ${data.postsAnalyzed} posts · ${data.draftsQueued} draft(s) queued.`,
        });
      } else {
        setNotice({
          kind: "err",
          msg: data.reason || data.error || "Collect blocked.",
        });
      }
    } catch (e) {
      setNotice({ kind: "err", msg: (e as Error).message });
    } finally {
      setCollecting(false);
      refresh();
    }
  }, [refresh]);

  const act = useCallback(
    async (id: string, action: "post" | "skip") => {
      busyIds.current.add(id);
      force((n) => n + 1);
      setNotice(null);
      try {
        const res = await fetch("/api/tweet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, action }),
        });
        const data = await res.json();
        if (!data.ok) {
          setNotice({ kind: "err", msg: data.error || "Action failed." });
        } else if (action === "post") {
          setNotice({ kind: "ok", msg: "Posted to X." });
        }
      } catch (e) {
        setNotice({ kind: "err", msg: (e as Error).message });
      } finally {
        busyIds.current.delete(id);
        force((n) => n + 1);
        refresh();
      }
    },
    [refresh]
  );

  const budgetRatio = spend
    ? spend.monthSpendUsd / Math.max(1, spend.monthlyBudgetUsd)
    : 0;
  const dotClass =
    budgetRatio >= 0.9 ? "bad" : budgetRatio >= 0.6 ? "warn" : "";

  const pending = queue?.tweets.filter((t) => t.status === "pending") ?? [];
  const done = queue?.tweets.filter((t) => t.status !== "pending") ?? [];

  return (
    <main className="wrap">
      <header className="masthead">
        <div>
          <div className="kicker">Roster Intelligence</div>
          <h1>Bears Pulse</h1>
          <div className="sub">
            What Bears Twitter is saying, ranked — and what The Roster should make
            about it.
          </div>
        </div>
        <div className="controls">
          <div className="chip" title="X spend this month">
            <span className={`dot ${dotClass}`} />
            <span>
              X spend{" "}
              <strong>
                {usd(spend?.monthSpendUsd)} / {usd(spend?.monthlyBudgetUsd)}
              </strong>
            </span>
            <span>·</span>
            <span>
              reads <strong>{spend?.readsToday ?? 0}</strong>/
              {spend?.maxReadsPerDay ?? 0}
            </span>
            <span>·</span>
            <span>
              posts <strong>{spend?.postsToday ?? 0}</strong>/
              {spend?.maxPostsPerDay ?? 0}
            </span>
          </div>
          <button onClick={collectNow} disabled={collecting}>
            {collecting ? "Collecting…" : "Collect now"}
          </button>
          <div className="section-note">
            last collect {ago(spend?.lastCollectAt ?? null)} · auto every{" "}
            {spend?.collectEveryMinutes ?? 180}m max
          </div>
        </div>
      </header>

      {notice && (
        <div className={notice.kind === "ok" ? "ok-note" : "err"}>
          {notice.msg}
        </div>
      )}

      {/* ---- lead ---- */}
      <section>
        <div className="section-head">
          <h2>Today&apos;s Pulse</h2>
          <span className="section-note">
            source: {pulse?.source ?? "…"} · {pulse?.postsAnalyzed ?? 0} posts ·
            updated {pulse ? ago(pulse.generatedAt) : "…"}
          </span>
        </div>
        <div className="card">
          <div className="tag">Lead</div>
          <div className="big-headline">{pulse?.headline ?? "Loading…"}</div>
          <div className="lead-row">
            <span>{pulse?.windowHours ?? 48}h window</span>
            <span>·</span>
            <span>{pulse?.stories.length ?? 0} live stories</span>
            <span>·</span>
            <span>{pulse?.players.length ?? 0} players in play</span>
          </div>
        </div>
      </section>

      {/* ---- players ---- */}
      <section>
        <div className="section-head">
          <h2>Players in the conversation</h2>
          <span className="section-note">ranked by gravity</span>
        </div>
        <div className="grid cols-4">
          {(pulse?.players ?? []).map((p) => {
            const max = pulse!.players[0]?.gravity || 1;
            return (
              <div className="card player" key={p.name}>
                <div className="name">{p.name}</div>
                <div className="bar">
                  <span
                    style={{ width: `${Math.max(6, (p.gravity / max) * 100)}%` }}
                  />
                </div>
                <div className="meta">
                  <span className="tag plain">{p.topCategory}</span>
                  <span>{p.mentions} mentions</span>
                  <span>gravity {p.gravity}</span>
                </div>
                <p>{p.sampleText}</p>
              </div>
            );
          })}
          {!pulse?.players.length && (
            <div className="empty">No player chatter in the last window.</div>
          )}
        </div>
      </section>

      {/* ---- stories ---- */}
      <section>
        <div className="section-head">
          <h2>Live stories</h2>
        </div>
        <div className="grid cols-2">
          {(pulse?.stories ?? []).map((s, i) => (
            <div className="card" key={i}>
              <div className="tag">{s.category}</div>
              <h3>{s.headline}</h3>
              <p>{s.summary}</p>
              <div className="meta">
                <span>{s.postCount} posts</span>
                <span>gravity {s.gravity}</span>
                {s.players.map((pl) => (
                  <span className="tag plain" key={pl}>
                    {pl}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!pulse?.stories.length && (
            <div className="empty">No clustered stories yet.</div>
          )}
        </div>
      </section>

      {/* ---- creator prompts ---- */}
      <section>
        <div className="section-head">
          <h2>Creator prompts</h2>
          <span className="section-note">what to make next</span>
        </div>
        <div className="grid cols-3">
          {(pulse?.creatorPrompts ?? []).map((c, i) => (
            <div className="card" key={i}>
              <h3>{c.angle}</h3>
              <p>{c.rationale}</p>
              <div className="meta">
                <span className="tag">{c.suggestedFormat}</span>
              </div>
            </div>
          ))}
          {!pulse?.creatorPrompts.length && (
            <div className="empty">No prompts generated.</div>
          )}
        </div>
      </section>

      {/* ---- viral ---- */}
      <section>
        <div className="section-head">
          <h2>Viral right now</h2>
          <span className="section-note">highest gravity posts</span>
        </div>
        <div className="grid cols-2">
          {(pulse?.viral ?? []).map((v, i) => (
            <div className="card" key={i}>
              <div className="meta">
                <span className="tag plain">
                  {v.isBeat ? "beat" : "fan"}
                </span>
                <strong>@{v.handle}</strong>
                <span>{v.name}</span>
              </div>
              <p style={{ color: "var(--cream)", fontSize: 15 }}>{v.text}</p>
              <div className="meta">
                <span>gravity {v.gravity}</span>
                <span>{v.likes.toLocaleString()} likes</span>
                <span>{v.retweets.toLocaleString()} RT</span>
              </div>
            </div>
          ))}
          {!pulse?.viral.length && (
            <div className="empty">Nothing hot in the window.</div>
          )}
        </div>
      </section>

      {/* ---- beat ---- */}
      <section>
        <div className="section-head">
          <h2>Beat writers</h2>
          <span className="section-note">newest first</span>
        </div>
        <div className="grid cols-2">
          {(pulse?.beat ?? []).map((b, i) => (
            <div className="card" key={i}>
              <div className="meta">
                <strong>@{b.handle}</strong>
                <span>{b.name}</span>
                <span className="tag plain">{b.category}</span>
                <span>{ago(b.createdAt)}</span>
              </div>
              <p style={{ color: "var(--cream)", fontSize: 15 }}>{b.text}</p>
            </div>
          ))}
          {!pulse?.beat.length && (
            <div className="empty">No beat posts in the window.</div>
          )}
        </div>
      </section>

      {/* ---- media vs fan + rival noise ---- */}
      <section>
        <div className="grid cols-2">
          <div className="card">
            <h2 style={{ marginBottom: 14 }}>Media vs fan</h2>
            <div className="split">
              <div
                className="media"
                style={{ flex: Math.max(1, pulse?.mediaVsFan.mediaShare ?? 1) }}
              >
                {pulse?.mediaVsFan.mediaShare ?? 0}%
              </div>
              <div
                className="fan"
                style={{ flex: Math.max(1, pulse?.mediaVsFan.fanShare ?? 1) }}
              >
                {pulse?.mediaVsFan.fanShare ?? 0}%
              </div>
            </div>
            <div className="meta">
              <span>media gravity {pulse?.mediaVsFan.mediaGravity ?? 0}</span>
              <span>fan gravity {pulse?.mediaVsFan.fanGravity ?? 0}</span>
            </div>
            <p>{pulse?.mediaVsFan.note}</p>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 14 }}>Rival noise</h2>
            {(pulse?.rivalNoise ?? []).map((r) => (
              <div className="meta" key={r.team} style={{ marginTop: 10 }}>
                <span className="tag plain">{r.team}</span>
                <span>{r.mentions} mentions</span>
                <span style={{ color: "var(--cream-dim)" }}>
                  {r.sampleText.slice(0, 90)}
                </span>
              </div>
            ))}
            {!pulse?.rivalNoise.length && (
              <p className="empty">Rivals are quiet.</p>
            )}
          </div>
        </div>
      </section>

      {/* ---- tweet queue ---- */}
      <section>
        <div className="section-head">
          <h2>Tweet queue</h2>
          <span className="section-note">
            drafts never contain links · AUTO_TWEET is off · you click Post
          </span>
        </div>
        <div className="grid">
          {pending.map((t) => {
            const busy = busyIds.current.has(t.id);
            return (
              <div className="queue-item" key={t.id}>
                <div className="queue-text">{t.text}</div>
                <div className="meta">
                  <span>{t.reason}</span>
                  <span>·</span>
                  <span>{t.text.length}/280</span>
                </div>
                <div className="queue-actions">
                  <button
                    className="small"
                    disabled={busy}
                    onClick={() => act(t.id, "post")}
                  >
                    {busy ? "Posting…" : "Post"}
                  </button>
                  <button
                    className="small ghost"
                    disabled={busy}
                    onClick={() => act(t.id, "skip")}
                  >
                    Skip
                  </button>
                </div>
              </div>
            );
          })}
          {!pending.length && (
            <div className="empty">
              No drafts pending. Run a collect to queue viral pickups.
            </div>
          )}

          {done.map((t) => (
            <div className={`queue-item ${t.status}`} key={t.id}>
              <div className="queue-text">{t.text}</div>
              <div className="queue-actions">
                <span className={`status-pill ${t.status}`}>{t.status}</span>
                {t.skippedReason && (
                  <span className="section-note">{t.skippedReason}</span>
                )}
                {t.postedAt && (
                  <span className="section-note">{ago(t.postedAt)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <span>The Roster · Roster Intelligence</span>
        <span>
          Pulse page: {SITE_URL}
          {PULSE_PATH}
        </span>
        <span>
          Client polls pulse/queue/spend every 20s. Collect runs only on demand
          or via authenticated cron.
        </span>
      </footer>
    </main>
  );
}
