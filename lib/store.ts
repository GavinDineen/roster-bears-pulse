import type { PulsePayload } from "./types";
import type { QueueFile } from "./queue-types";
import { fallbackPulse } from "./fallback";
import { kvGetJSON, kvSetJSON } from "./kv";

/** Returns the cached pulse, or the static fallback if nothing is stored yet. */
export async function readPulse(): Promise<PulsePayload> {
  return kvGetJSON<PulsePayload>("pulse", fallbackPulse());
}

export async function writePulse(pulse: PulsePayload): Promise<void> {
  await kvSetJSON("pulse", pulse);
}

export async function readQueue(): Promise<QueueFile> {
  return kvGetJSON<QueueFile>("queue", {
    updatedAt: new Date().toISOString(),
    tweets: [],
  });
}

export async function writeQueue(queue: QueueFile): Promise<void> {
  queue.updatedAt = new Date().toISOString();
  await kvSetJSON("queue", queue);
}
