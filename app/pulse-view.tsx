"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  PulsePayload,
  PlayerPulse,
  Story,
  ViralPost,
  BeatPost,
} from "@/lib/types";
import type { QueueFile, QueuedTweet } from "@/lib/queue-types";

type Pulse = Omit<PulsePayload, "postsAnalyzed" | "source"> &
  Partial<Pick<PulsePayload, "postsAnalyzed" | "source">>;

interface Spend {
  monthSpendUsd: number;
  monthlyBudgetUsd: number;
  readsToday: number;
  maxReadsPerDay: number;
  postsToday: number;
  maxPostsPerDay: number;
  lastCollectAt: string | null;
}

interface CollectResult {
  ok: boolean;
  reason?: string;
  error?: string;
  fetched?: number;
  kept?: number;
  dropped?: number;
  beatHalf?: string;
  draftsQueued?: number;
}

const POLL_MS = 20_000;

function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function PulseView({
  role,
  admin,
  initialPulse,
}: {
  role: "member" | "admin";
  admin: boolean;
  initialPulse: Pulse;
}) {
  const router = useRouter();
  const [pulse, setPulse] = useState<Pulse>(initialPulse);
  const [spend, setSpend] = useState<Spend | null>(null);
  const [queue, setQueue] = useState<QueueFile | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [lastCollect, setLastCollect] = useState<CollectResult | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null
  );
  const busy = useRef<Set<string>>(new Set());
  const [, bump] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const pRes = await fetch("/api/pulse", { cache: "no-store" });
      if (pRes.status === 401) {
        router.replace("/login");
        return;
      }
      setPulse(await pRes.json());
      if (admin) {
        const [s, q] = await Promise.all([
          fetch("/api/spend", { cache: "no-store" }).then((r) =>
            r.ok ? r.json() : null
          ),
          fetch("/api/queue", { cache: "no-store" }).then((r) =>
            r.ok ? r.json() : null
          ),
        ]);
        if (s) setSpend(s);
        if (q) setQueue(q);
      }
    } catch {
      /* keep last good state */
    }
  }, [admin, router]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }, [router]);

  const collectNow = useCallback(async () => {
    setCollecting(true);
    setNote(null);
    try {
      const res = await fetch("/api/collect", { method: "POST" });
      const data: CollectResult = await res.json();
      setLastCollect(data);
      if (!data.ok) {
        setNote({ kind: "err", msg: data.reason || data.error || "Blocked." });
      }
    } catch (e) {
      setNote({ kind: "err", msg: (e as Error).message });
    } finally {
      setCollecting(false);
      refresh();
    }
  }, [refresh]);

  const act = useCallback(
    async (id: string, action: "post" | "skip") => {
      busy.current.add(id);
      bump((n) => n + 1);
      setNote(null);
      try {
        const res = await fetch("/api/tweet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, action }),
        });
        const data = await res.json();
        if (!data.ok) setNote({ kind: "err", msg: data.error || "Failed." });
        else if (action === "post") setNote({ kind: "ok", msg: "Posted." });
      } catch (e) {
        setNote({ kind: "err", msg: (e as Error).message });
      } finally {
        busy.current.delete(id);
        bump((n) => n + 1);
        refresh();
      }
    },
    [refresh]
  );

  const pending = queue?.tweets.filter((t) => t.status === "pending") ?? [];
  const done = queue?.tweets.filter((t) => t.status !== "pending") ?? [];

  return (
    <main className="shell">
      <nav className="nav">
        <div className="wordmark">
          The Desk <span>·</span> Bears
        </div>
        <button className="navlink" onClick={logout}>
          Log out
        </button>
      </nav>

      {/* ---- lead ---- */}
      <section className="preview" style={{ paddingTop: "clamp(40px,8vw,88px)" }}>
        <p className="eyebrow">
          Bears · {pulse.windowHours}h · updated {ago(pulse.generatedAt)}
        </p>
        <h1 className="headline">{pulse.headline}</h1>
      </section>

      {/* ---- players ---- */}
      <Section label="Players in the conversation">
        {pulse.players.length ? (
          <div className="players">
            {pulse.players.map((p: PlayerPulse) => (
              <div className="player" key={p.name}>
                <span className="pname">{p.name}</span>
                <span className="pmeta">
                  {p.mentions} mentions · {p.topCategory}
                </span>
                {p.sampleText && <span className="pquote">{p.sampleText}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">No players moving the needle right now.</p>
        )}
      </Section>

      {/* ---- stories ---- */}
      <Section label="Stories">
        {pulse.stories.length ? (
          <div className="rows">
            {pulse.stories.map((s: Story, i: number) => (
              <article className="row" key={i}>
                <div className="row-lead">
                  <span className="eyebrow">{s.category}</span>
                </div>
                <h3>{s.headline}</h3>
                <p>{s.summary}</p>
                {s.players.length > 0 && (
                  <div className="meta">
                    {s.players.map((pl) => (
                      <span key={pl}>{pl}</span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">Nothing has clustered into a story yet.</p>
        )}
      </Section>

      {/* ---- creator prompts ---- */}
      <Section label="What to make">
        {pulse.creatorPrompts.length ? (
          <div className="rows">
            {pulse.creatorPrompts.map((c, i) => (
              <article className="row" key={i}>
                <h3>{c.angle}</h3>
                <p>{c.rationale}</p>
                <div className="meta">
                  <span className="accent">{c.suggestedFormat}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">No angles surfaced this cycle.</p>
        )}
      </Section>

      {/* ---- viral ---- */}
      <Section label="Traveling fastest">
        {pulse.viral.length ? (
          <div className="rows">
            {pulse.viral.map((v: ViralPost, i: number) => (
              <article className="row" key={i}>
                <h3>{v.text}</h3>
                <div className="meta">
                  <span>@{v.handle}</span>
                  <span>{v.isBeat ? "beat" : "fan"}</span>
                  <span>{v.likes.toLocaleString()} likes</span>
                  <span>{v.retweets.toLocaleString()} reposts</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">Quiet timeline.</p>
        )}
      </Section>

      {/* ---- beat ---- */}
      <Section label="The beat desk">
        {pulse.beat.length ? (
          <div className="rows">
            {pulse.beat.map((b: BeatPost, i: number) => (
              <article className="row" key={i}>
                <h3>{b.text}</h3>
                <div className="meta">
                  <span>@{b.handle}</span>
                  <span>{b.category}</span>
                  <span>{ago(b.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">No beat reporting in the window.</p>
        )}
      </Section>

      {/* ---- media vs fan ---- */}
      <Section label="Media vs fan">
        <div className="split">
          <i
            className="a"
            style={{ width: `${Math.max(2, pulse.mediaVsFan.mediaShare)}%` }}
          />
          <i
            className="b"
            style={{ width: `${Math.max(2, pulse.mediaVsFan.fanShare)}%` }}
          />
        </div>
        <div className="split-legend">
          <span>Media {pulse.mediaVsFan.mediaShare}%</span>
          <span>Fans {pulse.mediaVsFan.fanShare}%</span>
        </div>
        <p className="note">{pulse.mediaVsFan.note}</p>
      </Section>

      {/* ---- opposing noise ---- */}
      <Section label="Opposing noise">
        {pulse.rivalNoise.length ? (
          <div className="rows">
            {pulse.rivalNoise.map((r) => (
              <article className="row" key={r.team}>
                <div className="row-lead">
                  <h3>{r.team}</h3>
                  <span className="meta" style={{ marginTop: 0 }}>
                    {r.mentions} mentions
                  </span>
                </div>
                {r.sampleText && <p>{r.sampleText}</p>}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">Rivals are quiet.</p>
        )}
      </Section>

      {/* ---- ADMIN operator rail ---- */}
      {admin && (
        <section className="rail">
          <div className="section-label">Operator</div>

          <div className="rail-stats">
            <Stat
              k="Spend"
              v={
                <>
                  ${spend ? spend.monthSpendUsd.toFixed(2) : "0.00"}{" "}
                  <small>/ ${spend ? spend.monthlyBudgetUsd.toFixed(0) : "25"}</small>
                </>
              }
            />
            <Stat
              k="Reads today"
              v={
                <>
                  {spend?.readsToday ?? 0}{" "}
                  <small>/ {spend?.maxReadsPerDay ?? 400}</small>
                </>
              }
            />
            <Stat
              k="Posts today"
              v={
                <>
                  {spend?.postsToday ?? 0}{" "}
                  <small>/ {spend?.maxPostsPerDay ?? 5}</small>
                </>
              }
            />
            <Stat k="Last collect" v={<small>{ago(spend?.lastCollectAt)}</small>} />
          </div>

          <div className="thumb">
            <button
              className="btn accent"
              onClick={collectNow}
              disabled={collecting}
            >
              {collecting ? "Collecting…" : "Collect now"}
            </button>
          </div>

          {lastCollect && (
            <p className="note">
              {lastCollect.ok
                ? `Kept ${lastCollect.kept} · dropped ${lastCollect.dropped} · beat ${lastCollect.beatHalf} · ${lastCollect.draftsQueued} draft(s) queued`
                : `Not collected — ${lastCollect.reason || lastCollect.error}`}
            </p>
          )}
          {note && (
            <p className={`note ${note.kind === "err" ? "err" : ""}`}>{note.msg}</p>
          )}

          <div className="section-label" style={{ marginTop: 44 }}>
            Tweet queue
          </div>
          {pending.length === 0 && done.length === 0 && (
            <p className="empty">No drafts. Run a collect to queue viral pickups.</p>
          )}
          {pending.map((t: QueuedTweet) => {
            const b = busy.current.has(t.id);
            return (
              <div className="qitem" key={t.id}>
                <div className="qtext">{t.text}</div>
                <div className="meta">
                  <span>{t.reason}</span>
                  <span>{t.text.length}/280</span>
                </div>
                <div className="qactions">
                  <button
                    className="btn sm accent"
                    disabled={b}
                    onClick={() => act(t.id, "post")}
                  >
                    {b ? "…" : "Post"}
                  </button>
                  <button
                    className="btn sm ghost"
                    disabled={b}
                    onClick={() => act(t.id, "skip")}
                  >
                    Skip
                  </button>
                </div>
              </div>
            );
          })}
          {done.map((t: QueuedTweet) => (
            <div className="qitem" key={t.id} style={{ opacity: 0.55 }}>
              <div className="qtext">{t.text}</div>
              <div className="qactions">
                <span className={`pill ${t.status}`}>{t.status}</span>
                {t.skippedReason && <span className="pill">{t.skippedReason}</span>}
                {t.postedAt && <span className="pill">{ago(t.postedAt)}</span>}
              </div>
            </div>
          ))}
        </section>
      )}

      {!admin && role === "member" && <div style={{ height: 40 }} />}
    </main>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="block">
      <div className="section-label">{label}</div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </section>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
