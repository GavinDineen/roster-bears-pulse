import { promises as fs } from "fs";
import path from "path";

// Storage layer. On Vercel, set KV_REST_API_URL + KV_REST_API_TOKEN (Upstash
// Redis, added via the Vercel Marketplace) and state persists across requests.
// With neither set, state falls back to local .data/*.json files so `npm run
// dev` works with zero setup.

const REST_URL = process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN;

export const usingRedis = !!(REST_URL && REST_TOKEN);

const DATA_DIR = path.join(process.cwd(), ".data");

async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(REST_URL as string, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`KV ${command[0]} failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`KV ${command[0]} error: ${json.error}`);
  return json.result ?? null;
}

export async function kvGetJSON<T>(key: string, fallback: T): Promise<T> {
  if (usingRedis) {
    const raw = (await redis(["GET", key])) as string | null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  }
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${key}.json`), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function kvSetJSON(key: string, value: unknown): Promise<void> {
  if (usingRedis) {
    await redis(["SET", key, JSON.stringify(value)]);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    path.join(DATA_DIR, `${key}.json`),
    JSON.stringify(value, null, 2),
    "utf8"
  );
}
