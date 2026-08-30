import type { PulsePayload } from "./types";

/**
 * Static Bears "cutdown Sunday" fallback so the UI is fully populated with $0
 * of X spend — used when no bearer token is set, when a collect is blocked and
 * there is no cache yet, or when a read fails.
 */
export function fallbackPulse(): PulsePayload {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    source: "fallback",
    postsAnalyzed: 0,
    windowHours: 48,
    headline:
      "Cutdown Sunday: Bears trim to 53, and the practice-squad math begins",
    players: [
      {
        name: "Caleb Williams",
        mentions: 14,
        gravity: 212,
        topCategory: "practice",
        sampleText:
          "Caleb Williams closed camp with a clean two-minute drill — the command of the huddle is the story going into Week 1.",
      },
      {
        name: "Rome Odunze",
        mentions: 9,
        gravity: 148,
        topCategory: "analysis",
        sampleText:
          "Rome Odunze's camp arc points to a real perimeter role from the opener, not a slow rookie ramp.",
      },
      {
        name: "Roschon Johnson",
        mentions: 7,
        gravity: 96,
        topCategory: "roster-move",
        sampleText:
          "Roschon Johnson vs a crowded back room — special-teams value is what keeps him on the 53.",
      },
      {
        name: "Tyrique Stevenson",
        mentions: 6,
        gravity: 84,
        topCategory: "analysis",
        sampleText:
          "A Tyrique Stevenson bounce-back is a quiet swing factor for the secondary this year.",
      },
      {
        name: "Velus Jones",
        mentions: 5,
        gravity: 57,
        topCategory: "rumor",
        sampleText:
          "Velus Jones on the roster bubble again as the return-game reps shrink.",
      },
    ],
    stories: [
      {
        headline:
          "Roster move — Bears cut to 53, several UDFAs headed back to the practice squad",
        summary:
          "Front office is working the waiver wire; a corner and an interior offensive lineman are the reported targets.",
        category: "roster-move",
        gravity: 320,
        players: ["Roschon Johnson", "Velus Jones"],
        postCount: 22,
      },
      {
        headline:
          "Injury watch — one starter's ankle is the thing to monitor before the opener",
        summary:
          "Staff is using day-to-day language and no MRI has been reported yet.",
        category: "injury",
        gravity: 138,
        players: [],
        postCount: 8,
      },
      {
        headline:
          "Film & analysis — the offense projects a much higher play-action rate",
        summary:
          "Camp install leaned heavily on boot and play-action; creators are already digging into the tape.",
        category: "analysis",
        gravity: 121,
        players: ["Caleb Williams"],
        postCount: 11,
      },
    ],
    creatorPrompts: [
      {
        angle: "The 53-man cut tracker with instant depth-chart impact",
        rationale:
          "Cutdown day is the single highest-traffic Bears news window of the summer.",
        suggestedFormat: "Live blog + depth-chart graphic",
      },
      {
        angle: "Who Chicago should claim off waivers before the Sunday deadline",
        rationale: "Waiver priority is high and fans want names, not theory.",
        suggestedFormat: "Quick-hit list video",
      },
      {
        angle: "Caleb Williams' camp, graded throw by throw",
        rationale:
          "QB1 content always overperforms and camp just wrapped — timing is ideal.",
        suggestedFormat: "Film-room thread",
      },
    ],
    viral: [
      {
        handle: "TheBearsWire",
        name: "Bears Wire",
        text: "It's official: the Bears are down to 53. Full breakdown of every move coming shortly.",
        gravity: 182,
        likes: 2400,
        retweets: 310,
        isBeat: true,
      },
      {
        handle: "AdamHoge",
        name: "Adam Hoge",
        text: "The practice squad is where this roster gets interesting. Watch the offensive line and the secondary.",
        gravity: 151,
        likes: 1800,
        retweets: 190,
        isBeat: true,
      },
    ],
    beat: [
      {
        handle: "BradBiggs",
        name: "Brad Biggs",
        text: "Roster projection held up well — the last two spots came down to special-teams value.",
        createdAt: now,
        category: "roster-move",
      },
      {
        handle: "kfishbain",
        name: "Kevin Fishbain",
        text: "A few notable names cleared waivers last year and returned. Expect a similar pattern this week.",
        createdAt: now,
        category: "analysis",
      },
    ],
    mediaVsFan: {
      mediaShare: 45,
      fanShare: 55,
      mediaGravity: 620,
      fanGravity: 540,
      note: "Beat writers are setting the agenda on cutdown day.",
    },
    rivalNoise: [
      {
        team: "Packers",
        mentions: 6,
        sampleText:
          "Packers finalized their 53 as well — the NFC North arms race continues.",
      },
      {
        team: "Lions",
        mentions: 4,
        sampleText: "A couple of Lions cuts caught the eye of Bears fans.",
      },
    ],
  };
}
