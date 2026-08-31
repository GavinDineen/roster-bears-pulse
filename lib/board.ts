import { kvGetJSON, kvSetJSON } from "./kv";
import type { Board } from "./types";

// FREE BOARD — not X, not billed against the $25 float. ESPN's public
// (unauthenticated) team JSON for record/next-game/last-score, plus
// weather.gov for Soldier Field when the next game is home. Cached like
// FACTS: fetch on collect, serve stale on any failure, and if there's no
// cache to fall back to either, hide the board rather than fake a score.

const CACHE_KEY = "board";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

const ESPN_TEAM_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/chi";
const ESPN_SCHEDULE_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/chi/schedule";

// Soldier Field.
const SOLDIER_FIELD_LAT = 41.8623;
const SOLDIER_FIELD_LON = -87.6167;

// weather.gov requires a descriptive User-Agent identifying the caller.
const WEATHER_UA = "TheRosterCollective-Desk (contact: admin@therostercollective.com)";

interface CachedBoard {
  storedAt: number;
  board: Board;
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** One °F reading for Soldier Field at (closest hour to) `whenIso`, or null on any failure. */
async function fetchKickoffWeatherF(whenIso: string): Promise<number | null> {
  try {
    const points = await fetchJson(
      `https://api.weather.gov/points/${SOLDIER_FIELD_LAT},${SOLDIER_FIELD_LON}`,
      { "user-agent": WEATHER_UA },
    );
    const forecastUrl = points?.properties?.forecastHourly;
    if (!forecastUrl) return null;
    const forecast = await fetchJson(forecastUrl, { "user-agent": WEATHER_UA });
    const periods: any[] = forecast?.properties?.periods ?? [];
    if (periods.length === 0) return null;

    const target = new Date(whenIso).getTime();
    let best: any = periods[0];
    let bestDelta = Infinity;
    for (const p of periods) {
      const delta = Math.abs(new Date(p.startTime).getTime() - target);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = p;
      }
    }
    return typeof best.temperature === "number" ? best.temperature : null;
  } catch {
    return null;
  }
}

function teamAbbrevToName(abbr: string): string {
  const map: Record<string, string> = {
    GB: "Packers",
    MIN: "Vikings",
    DET: "Lions",
    DAL: "Cowboys",
    PHI: "Eagles",
    NYG: "Giants",
    WSH: "Commanders",
    SF: "49ers",
    SEA: "Seahawks",
    LAR: "Rams",
    ARI: "Cardinals",
    ATL: "Falcons",
    CAR: "Panthers",
    NO: "Saints",
    TB: "Buccaneers",
    CIN: "Bengals",
    CLE: "Browns",
    BAL: "Ravens",
    PIT: "Steelers",
    BUF: "Bills",
    MIA: "Dolphins",
    NE: "Patriots",
    NYJ: "Jets",
    TEN: "Titans",
    IND: "Colts",
    HOU: "Texans",
    JAX: "Jaguars",
    DEN: "Broncos",
    KC: "Chiefs",
    LV: "Raiders",
    LAC: "Chargers",
    CHI: "Bears",
  };
  return map[abbr] ?? abbr;
}

async function fetchBoardFresh(): Promise<Board | null> {
  const [team, schedule] = await Promise.all([
    fetchJson(ESPN_TEAM_URL),
    fetchJson(ESPN_SCHEDULE_URL),
  ]);

  const record: string =
    team?.team?.record?.items?.find((i: any) => i.type === "total")?.summary ??
    team?.team?.record?.items?.[0]?.summary ??
    "";
  if (!record) return null; // core signal missing — hide the board

  const events: any[] = schedule?.events ?? [];
  const now = Date.now();

  let next: Board["next"] = null;
  let last: Board["last"] = null;

  for (const ev of events) {
    const comp = ev?.competitions?.[0];
    if (!comp) continue;
    const state = comp?.status?.type?.state; // "pre" | "in" | "post"
    const competitors: any[] = comp?.competitors ?? [];
    const opponent = competitors.find((c: any) => c?.team?.abbreviation !== "CHI");
    const self = competitors.find((c: any) => c?.team?.abbreviation === "CHI");
    if (!opponent || !self) continue;
    const opponentName = teamAbbrevToName(opponent.team?.abbreviation ?? "");
    const kickoffIso: string = comp.date ?? ev.date;

    if (state === "pre" && new Date(kickoffIso).getTime() >= now && !next) {
      next = { opponent: opponentName, isHome: self.homeAway === "home", kickoffIso };
    }
    if (state === "post") {
      // events are chronological — keep overwriting so we end on the most recent final
      const selfScore = Number(self.score?.value ?? self.score ?? NaN);
      const oppScore = Number(opponent.score?.value ?? opponent.score ?? NaN);
      if (Number.isFinite(selfScore) && Number.isFinite(oppScore)) {
        const result = selfScore > oppScore ? "W" : selfScore < oppScore ? "L" : "T";
        last = { result, score: `${selfScore}-${oppScore}`, opponent: opponentName };
      }
    }
  }

  let weatherF: number | null = null;
  if (next?.isHome) {
    weatherF = await fetchKickoffWeatherF(next.kickoffIso);
  }

  return { record, next, last, weatherF };
}

export async function getBoard(): Promise<Board | null> {
  const cached = await kvGetJSON<CachedBoard | null>(CACHE_KEY, null);
  if (cached && Date.now() - cached.storedAt < CACHE_TTL_MS) {
    return cached.board;
  }
  try {
    const fresh = await fetchBoardFresh();
    if (!fresh) return cached?.board ?? null; // fail closed, but prefer stale over nothing
    await kvSetJSON(CACHE_KEY, { storedAt: Date.now(), board: fresh } as CachedBoard);
    return fresh;
  } catch {
    // Network/parse failure — serve stale if we have it, otherwise hide.
    return cached?.board ?? null;
  }
}
