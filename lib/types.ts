export type Category =
  | "roster-move"
  | "injury"
  | "practice"
  | "presser"
  | "rumor"
  | "analysis"
  | "hype"
  | "rival"
  | "other";

export interface RawPost {
  id: string;
  text: string;
  authorId: string;
  authorHandle: string;
  authorName: string;
  createdAt: string;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  impressions?: number;
  isBeat: boolean;
  url: string;
}

export interface ScoredPost extends RawPost {
  category: Category;
  gravity: number;
  players: string[];
}

export interface PlayerPulse {
  name: string;
  mentions: number;
  gravity: number;
  topCategory: Category;
  sampleText: string;
}

export interface Story {
  headline: string;
  summary: string;
  category: Category;
  gravity: number;
  players: string[];
  postCount: number;
}

export interface CreatorPrompt {
  angle: string;
  rationale: string;
  suggestedFormat: string;
}

export interface ViralPost {
  handle: string;
  name: string;
  text: string;
  gravity: number;
  likes: number;
  retweets: number;
  isBeat: boolean;
}

export interface BeatPost {
  handle: string;
  name: string;
  text: string;
  createdAt: string;
  category: Category;
}

export interface MediaVsFan {
  mediaShare: number;
  fanShare: number;
  mediaGravity: number;
  fanGravity: number;
  note: string;
}

export interface RivalNoise {
  team: string;
  mentions: number;
  sampleText: string;
}

export interface PulsePayload {
  generatedAt: string;
  source: "live" | "fallback" | "cache";
  postsAnalyzed: number;
  windowHours: number;
  headline: string;
  players: PlayerPulse[];
  stories: Story[];
  creatorPrompts: CreatorPrompt[];
  viral: ViralPost[];
  beat: BeatPost[];
  mediaVsFan: MediaVsFan;
  rivalNoise: RivalNoise[];
}
