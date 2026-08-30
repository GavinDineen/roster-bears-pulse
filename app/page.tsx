import Link from "next/link";
import { getSession } from "@/lib/auth";
import { readPulse } from "@/lib/store";
import type { PulsePayload } from "@/lib/types";
import PulseView from "./pulse-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function memberView(p: PulsePayload) {
  const { postsAnalyzed, source, ...rest } = p;
  void postsAnalyzed;
  void source;
  return rest;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ admin?: string }>;
}) {
  const [session, sp, pulse] = await Promise.all([
    getSession(),
    searchParams,
    readPulse(),
  ]);

  if (!session) return <Preview pulse={pulse} />;

  const showAdmin = session.role === "admin" && sp.admin !== undefined;
  return (
    <PulseView
      role={session.role}
      admin={showAdmin}
      initialPulse={session.role === "admin" ? pulse : memberView(pulse)}
    />
  );
}

/* ---------- logged-out preview ---------- */
function Preview({ pulse }: { pulse: PulsePayload }) {
  const players = pulse.players.slice(0, 2);
  const story = pulse.stories[0];

  return (
    <main className="shell">
      <nav className="nav">
        <div className="wordmark">
          The Desk <span>·</span> Bears
        </div>
        <Link className="navlink" href="/login">
          Log in
        </Link>
      </nav>

      <section className="preview">
        <p className="eyebrow">Bears · The Desk</p>
        <h1 className="headline">{pulse.headline}</h1>

        <div className="preview-players">
          {players.map((p) => (
            <div className="player" key={p.name}>
              <span className="pname">{p.name}</span>
              <span className="pmeta">
                {p.mentions} mentions
                <br />
                {p.topCategory}
              </span>
            </div>
          ))}
        </div>

        {story && (
          <div className="preview-story">
            <p className="eyebrow">{story.category}</p>
            <h3
              style={{
                fontSize: "clamp(1.2rem,3vw,1.7rem)",
                fontWeight: 560,
                letterSpacing: "-0.02em",
                marginTop: 10,
              }}
            >
              {story.headline}
            </h3>
          </div>
        )}

        <div className="locked" aria-hidden="true">
          <div className="skel big" />
          <div className="skel w90" />
          <div className="skel w70" />
          <div className="skel w45" />
          <div className="skel w90" />
          <div className="skel w70" />
          <div className="skel big" />
          <div className="skel w70" />
          <div className="skel w90" />
          <div className="skel w45" />
        </div>
      </section>

      <div className="gate">
        <p className="gate-title">The Desk is for The Roster.</p>
        <Link className="btn accent" href="/login">
          Log in
        </Link>
      </div>
    </main>
  );
}
