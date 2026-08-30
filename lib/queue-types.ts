export type TweetStatus = "pending" | "posted" | "skipped";

export interface QueuedTweet {
  id: string;
  text: string;
  reason: string;
  sourceGravity: number;
  createdAt: string;
  status: TweetStatus;
  postedId?: string;
  postedAt?: string;
  skippedReason?: string;
}

export interface QueueFile {
  updatedAt: string;
  tweets: QueuedTweet[];
}
