# Scoring Guide Reference

Load this file when RICE/ICE scoring is ambiguous, capacity planning is complex, or dependency mapping needs more structure.

---

## RICE Scoring — Worked Examples

### Example 1: Solo Founder, Healthcare SaaS, Early Revenue Stage

**Feature: AI-generated SOAP note from voice dictation**

| Factor | Raw value | Score |
|---|---|---|
| Reach | ~90% of active users would use this daily | High → 0.9 |
| Impact | Saves 15–20 min/AT/day; directly addresses #1 pain point | Massive → 3 |
| Confidence | 3 ATs confirmed in interviews; usage data shows documentation is slowest step | High → 100% |
| Effort | 3 weeks solo build (backend + UI + voice API integration) | 3 person-weeks |

**RICE = (0.9 × 3 × 1.0) / 3 = 0.9**

Interpretation: High score. Build now.

---

**Feature: Multi-institution reporting dashboard**

| Factor | Raw value | Score |
|---|---|---|
| Reach | ~15% of users (only multi-site accounts) | Low → 0.15 |
| Impact | Valuable for enterprise buyers; not relevant for solo ATs | Medium → 1 |
| Confidence | No direct customer ask yet; assumption-based | Low → 50% |
| Effort | 6 weeks solo build | 6 person-weeks |

**RICE = (0.15 × 1 × 0.5) / 6 = 0.0125**

Interpretation: Very low. Defer to Later.

---

## Solo Founder Capacity Adjustment

Realistic capacity multiplier for solo founders: **×1.5 on all effort estimates.**

Reasons:
- Context switching overhead (no dedicated focus)
- No code review / second set of eyes → more debugging cycles
- Wearing multiple hats (support, sales, product, engineering)
- Interruptions, admin, legal, partnerships

**Rule of thumb:** If you estimate 2 weeks, plan for 3. If you estimate 4 weeks, plan for 6.

**Healthy allocation for solo founder:**
- 60% planned feature work (roadmap items)
- 25% unplanned (bugs, urgent requests, customer calls)
- 15% technical health (refactoring, dependency updates, security)

Do not plan more than 60% of your calendar weeks on roadmap items. The rest fills itself.

---

## Effort Estimation Tiers

| Tier | Solo estimate | With 1 contractor | Description |
|---|---|---|---|
| XS | 1–3 days | 1–2 days | UI change, config toggle, copy update, minor API call |
| S | 1 week | 3–4 days | New UI component, simple CRUD feature, integration with existing data |
| M | 2–3 weeks | 1–1.5 weeks | New feature with UI + API + DB changes, third-party integration |
| L | 4–6 weeks | 2–3 weeks | Major feature, new data model, significant UX surface |
| XL | 8+ weeks | 4+ weeks | New product area, platform-level change, compliance-touching feature |

**Executor note — human calendar time.** These tiers are human dev/contractor time, and they are the right unit for solo-founder capacity planning and the RICE Effort denominator (a *scope and cost* signal). They are **not** when-it-ships if an AI agent does the build — agent wall-clock runs 10–100× shorter (an "L / 4–6 week" feature is often an afternoon of agent time plus review). When an agent is the builder, size the delivery estimate with the `time-sense` skill and keep these tiers for scope and human capacity only.

---

## Dependency Mapping Patterns

### Linear Chain
```
Feature A → Feature B → Feature C
```
A must ship before B starts. B must ship before C starts.
Risk: One delay cascades through the chain.
Mitigation: Identify the chain early; start A immediately.

### Fork
```
Feature A → Feature B
           → Feature C
           → Feature D
```
A unlocks multiple features. Prioritize A above all else.
Mitigation: Keep A scope tight — don't let A become a bloat project.

### Parallel (ideal)
```
Feature A (standalone)
Feature B (standalone)
Feature C (standalone)
```
No dependencies. Build in RICE score order.

### Merge
```
Feature A ──┐
Feature B ──┼→ Feature C
```
C requires both A and B. Flag C as blocked until both predecessors ship.

---

## Common Sequencing Rules (Examples)

These are patterns from real products — adapt to the specific project:

**"Core loop first"** — Don't build adjacent features until the primary user workflow works end-to-end without friction.

**"Revenue gate"** — Don't build features that don't touch the revenue path until [milestone] is hit.

**"Compliance first"** — Any feature that touches PHI/PII/regulated data must be scoped with compliance in mind before any build starts.

**"Integration before expansion"** — Don't expand to new user segments until existing integration is solid.

**"One surface at a time"** — Don't open a new UI surface (mobile, admin portal, API) until the primary surface is stable.

---

## Capacity Table Template

Use this to surface overcommit risk:

| Week | Available days | Committed to | Remaining |
|---|---|---|---|
| Week 1 | 4 (allow 1 for overhead) | Feature A | 0 |
| Week 2 | 4 | Feature A | 0 |
| Week 3 | 4 | Feature B | 0 |
| Week 4 | 4 | Feature B | 1 (buffer) |

**Red flag:** If every row shows 0 remaining, the plan is fragile. One bug or customer call breaks the schedule.

**Rule:** Maintain at least 1 buffer day per week in Now items. More if the product is in active customer use.
