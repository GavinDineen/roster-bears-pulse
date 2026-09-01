# Ideation Frameworks Reference

Load this file when a session requires deep framework application beyond what's in the main SKILL.md.

---

## How Might We (HMW)

Reframe problems as opportunities — turn a pain point into an actionable question. Most useful early
in EXPLORE mode, right after framing, when the problem is understood but the solution space isn't
open yet.

**Structure:** "How might we [desired outcome] for [user] without [constraint]?"

**Tips:**
- Too broad: "How might we improve onboarding?" — could mean anything
- Too narrow: "How might we add a tooltip to step 3?" — that's a solution, not a question
- Right level: "How might we help new users reach their first success within 10 minutes?"
- Generate 5–10 HMW questions from a single problem statement. Each reframing opens a different
  solution space.

---

## Jobs-to-be-Done (JTBD) Deep Dive

**Core structure:** "When [situation], I want to [motivation] so I can [expected outcome]."

**Three job types to probe:**
- **Functional** — Get something done efficiently (easiest to identify, often already solved)
- **Emotional** — Feel a certain way doing it (confident, in control, not overwhelmed)
- **Social** — Be seen a certain way by others (competent, ahead, credible)

**The "firing" question:** What did the customer fire (stop using or doing) when they hired your product? This reveals the real competitive set — it's almost never what you think.

**Job map technique:** Sequence the customer's job into stages:
1. Define → 2. Locate → 3. Prepare → 4. Confirm → 5. Execute → 6. Monitor → 7. Modify → 8. Conclude

Find which stage has the most friction. Build there.

---

## SCAMPER Applied to Product

Use when stuck on incrementalism. Run each lens against your existing product:

- **Substitute** — What core component could be replaced? What if AI did the step a human currently does?
- **Combine** — What two separate workflows could be merged? What if two user roles shared one interface?
- **Adapt** — What does a product in a completely different industry do that you could borrow?
- **Modify/Magnify** — What if you made this 10x more powerful? 10x simpler? 10x faster?
- **Put to other use** — Could this feature serve a different user type? A different use case?
- **Eliminate** — What if you removed this entirely? Would anyone notice? Would removing it actually improve the product?
- **Reverse/Rearrange** — What if the workflow went backward? What if the user never had to initiate anything?

---

## Opportunity Solution Tree

Use when you have a desired outcome and need to map paths to it.

```
Desired Outcome (e.g., "Increase AT retention by 30%")
├── Opportunity A: ATs feel overwhelmed by documentation burden
│   ├── Solution A1: AI voice-to-SOAP auto-generation
│   │   ├── Experiment: Prototype with 3 ATs, measure time saved
│   │   └── Experiment: Shadowing session to map current documentation workflow
│   └── Solution A2: Template library for common injury types
│       └── Experiment: Survey: which injury types take longest to document?
├── Opportunity B: ATs don't see ROI on the tool fast enough
│   ├── Solution B1: Onboarding that shows time-saved dashboard on Day 1
│   └── Solution B2: Peer comparison ("ATs like you save X hours/week")
└── Opportunity C: ATs leave when their institution doesn't renew
    └── Solution C1: Individual AT account that persists across employers
```

Rules:
- Every opportunity must trace to customer research, not internal assumption
- Multiple solutions per opportunity — if you only have one, you haven't explored enough
- The cheapest experiment wins, not the most impressive one

---

## First Principles Decomposition

Use when the team is stuck in incremental thinking or when a category hasn't been reimagined.

**Process:**
1. **State the current approach** — How is this problem solved today?
2. **Identify the underlying assumptions** — What must be true for the current approach to make sense?
3. **Question each assumption** — Is this actually true, or is it inherited convention?
4. **Identify the fundamental truths** — What do we know for certain about the problem (physics, human behavior, economics)?
5. **Rebuild from fundamentals** — Given only those truths, what solutions are possible?

**Example applied:**
- Current approach: Athletic trainers document injuries after the fact using typed notes
- Assumptions: Documentation happens after treatment; it requires structured forms; the AT is the one who enters data
- Question: Does documentation have to happen after? Does it have to be typed? Does the AT have to be the author?
- Fundamental truths: The information exists during treatment; voice is faster than typing; AI can structure unstructured input
- Rebuild: Real-time ambient documentation during treatment, structured by AI, reviewed and approved in seconds

---

## OODA Loop for Product Velocity

Use when the team is over-deliberating or when a competitive window is closing.

**Observe:** What signals do you have right now — user feedback, usage data, competitive moves, support tickets, sales objections?

**Orient:** What do those signals mean given your current mental model? Challenge the model: are you seeing what's actually there, or what you expect?

**Decide:** Pick a direction. Not a final commitment — a hypothesis to test. Calibrate bet size to confidence.

**Act:** Ship something. Run the experiment. Then immediately return to Observe.

**The OODA advantage:** Most product teams get stuck in Orient. They analyze, debate, wait for more data. OODA says: orient with what you have, act, and let the next cycle correct you. The team that cycles fastest learns fastest.

---

## Inversion / Reverse Brainstorming

Use when stuck on how to solve a problem. Brainstorm how to make it worse first.

1. **Invert the problem:** "How could we make [goal] as difficult as possible?"
2. **Generate freely:** List everything that would make it worse — more steps, less clarity, slower feedback, more confusion
3. **Reverse each idea:** Each "make it worse" contains the seed of "make it better"
4. **Evaluate:** Which reversals are most actionable?

**Why it works:** People are better at identifying what's wrong than imagining what's right. Inversion unlocks creative thinking when forward-brainstorming is stuck.
