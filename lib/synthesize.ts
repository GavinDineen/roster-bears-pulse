import type {
  Category,
  PulsePayload,
  ScoredPost,
  PlayerPulse,
  Story,
  CreatorPrompt,
  ViralPost,
  BeatPost,
  MediaVsFan,
  RivalNoise,
} from "./types";
import { RIVAL_TEAMS } from "./config";
import { stripUrls } from "./rank";

const CAT_LABEL: Record<Category, string> = {
  "roster-move": "Roster move",
  injury: "Injury watch",
  practice: "Practice report",
  presser: "Presser",
  rumor: "Rumor mill",
  analysis: "Film & analysis",
  hype: "Fan hype",
  rival: "Rival noise",
  other: "Around the Bears",
};

function clean(text: string): string {
  return stripUrls(text).replace(/\s+/g, " ").trim();
}

function headlineFor(c: Category, top: ScoredPost, players: string[]): string {
  const who = players[0] ? `${players[0]}: ` : "";
  const snippet = clean(top.text);
  return `${CAT_LABEL[c]} — ${who}${snippet.slice(0, 96)}${snippet.length > 96 ? "…" : ""}`;
}

function buildPrompts(stories: Story[], players: PlayerPulse[]): CreatorPrompt[] {
  const out: CreatorPrompt[] = [];
  for (const s of stories.slice(0, 3)) {
    out.push({
      angle: s.headline,
      rationale: `${s.postCount} posts, combined gravity ${s.gravity}. ${CAT_LABEL[s.category]} is the live thread.`,
      suggestedFormat:
        s.category === "analysis"
          ? "Film-room thread"
          : s.category === "roster-move"
            ? "Quick-hit reaction + depth-chart graphic"
            : s.category === "injury"
              ? "Status explainer short"
              : "Talking-head short",
    });
  }
  if (players[0]) {
    out.push({
      angle: `Why ${players[0].name} is the name Bears fans can't stop typing`,
      rationale: `${players[0].mentions} mentions, top theme ${CAT_LABEL[players[0].topCategory]}.`,
      suggestedFormat: "Player-focused explainer",
    });
  }
  return out.slice(0, 4);
}

export function synthesize(posts: ScoredPost[], windowHours = 48): PulsePayload {
  const now = new Date().toISOString();

  // ---- players ----
  const pmap = new Map<
    string,
    {
      mentions: number;
      gravity: number;
      cats: Map<Category, number>;
      sample: string;
      sampleG: number;
    }
  >();
  for (const p of posts) {
    for (const name of p.players) {
      const e =
        pmap.get(name) ??
        { mentions: 0, gravity: 0, cats: new Map(), sample: "", sampleG: -1 };
      e.mentions += 1;
      e.gravity += p.gravity;
      e.cats.set(p.category, (e.cats.get(p.category) ?? 0) + 1);
      if (p.gravity > e.sampleG) {
        e.sample = clean(p.text);
        e.sampleG = p.gravity;
      }
      pmap.set(name, e);
    }
  }
  const players: PlayerPulse[] = [...pmap.entries()]
    .map(([name, e]) => ({
      name,
      mentions: e.mentions,
      gravity: e.gravity,
      topCategory:
        [...e.cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other",
      sampleText: e.sample,
    }))
    .sort((a, b) => b.gravity - a.gravity)
    .slice(0, 8);

  // ---- stories (cluster by category) ----
  const cmap = new Map<Category, ScoredPost[]>();
  for (const p of posts) {
    const arr = cmap.get(p.category) ?? [];
    arr.push(p);
    cmap.set(p.category, arr);
  }
  const stories: Story[] = [...cmap.entries()]
    .filter(([c]) => c !== "other" && c !== "hype")
    .map(([c, arr]) => {
      arr.sort((a, b) => b.gravity - a.gravity);
      const storyPlayers = [...new Set(arr.flatMap((x) => x.players))].slice(0, 4);
      return {
        headline: headlineFor(c, arr[0], storyPlayers),
        summary: clean(arr[0].text),
        category: c,
        gravity: arr.reduce((s, x) => s + x.gravity, 0),
        players: storyPlayers,
        postCount: arr.length,
      };
    })
    .sort((a, b) => b.gravity - a.gravity)
    .slice(0, 5);

  // ---- viral ----
  const viral: ViralPost[] = [...posts]
    .sort((a, b) => b.gravity - a.gravity)
    .slice(0, 6)
    .map((p) => ({
      handle: p.authorHandle,
      name: p.authorName,
      text: clean(p.text),
      gravity: p.gravity,
      likes: p.likes,
      retweets: p.retweets,
      isBeat: p.isBeat,
    }));

  // ---- beat ----
  const beat: BeatPost[] = posts
    .filter((p) => p.isBeat)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 6)
    .map((p) => ({
      handle: p.authorHandle,
      name: p.authorName,
      text: clean(p.text),
      createdAt: p.createdAt,
      category: p.category,
    }));

  // ---- media vs fan ----
  const media = posts.filter((p) => p.isBeat);
  const fan = posts.filter((p) => !p.isBeat);
  const total = Math.max(1, posts.length);
  const mediaGravity = media.reduce((s, p) => s + p.gravity, 0);
  const fanGravity = fan.reduce((s, p) => s + p.gravity, 0);
  const mediaVsFan: MediaVsFan = {
    mediaShare: Math.round((media.length / total) * 100),
    fanShare: Math.round((fan.length / total) * 100),
    mediaGravity,
    fanGravity,
    note:
      mediaGravity >= fanGravity
        ? "Beat writers are driving the conversation right now."
        : "Fans are outpacing the beat on volume and reach right now.",
  };

  // ---- rival noise ----
  const rivalNoise: RivalNoise[] = RIVAL_TEAMS.map((rt) => {
    const hits = posts.filter((p) =>
      rt.terms.some((t) => p.text.toLowerCase().includes(t.toLowerCase()))
    );
    hits.sort((a, b) => b.gravity - a.gravity);
    return {
      team: rt.team,
      mentions: hits.length,
      sampleText: hits[0] ? clean(hits[0].text) : "",
    };
  }).filter((r) => r.mentions > 0);

  const creatorPrompts = buildPrompts(stories, players);

  const headline =
    stories[0]?.headline ??
    (players[0]
      ? `${players[0].name} is leading Bears Twitter today`
      : "Quiet day on Bears Twitter");

  return {
    generatedAt: now,
    source: "live",
    postsAnalyzed: posts.length,
    windowHours,
    headline,
    players,
    stories,
    creatorPrompts,
    viral,
    beat,
    mediaVsFan,
    rivalNoise,
  };
}
