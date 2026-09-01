# Extraction Schemas — the structure every subagent returns

Load this when running the fan-out. These schemas are the contract: each research subagent fills one and returns it as JSON — **nothing else**. The orchestrator synthesizes from these compact objects, never from raw pages. Forcing a fixed schema is half the token savings (no re-deriving "what to extract") and half the depth (every dimension gets covered, every claim gets evidence + a so-what).

## The depth bar (why this beats a shallow analysis)

A shallow analysis lists facts. A deep one explains the *game*. Every filled field must carry three things, or it's not done:
1. **The fact** — what's true.
2. **Evidence** — the source URL (so it's checkable, not hallucinated).
3. **Confidence** — `high | med | low`, honest. Low confidence is fine and *useful* — it drives the refresh schedule (see `references/output-template.md`).

And every competitor object must end with **`implications_for_us`** — the so-what. A finding with no implication is noise. This is the single rule that prevents the "didn't understand the market / not deep enough" failure: you cannot fill the schema by skimming; you have to reason about what each fact *means for our product*.

Unknowns are first-class: record what you **couldn't** determine in `open_unknowns`. That's not failure — it's the honest edge of the analysis and it tells the next run where to dig.

---

## Per-competitor schema

One object per competitor, returned by that competitor's subagent.

```json
{
  "competitor": "Name",
  "url": "https://…",
  "relation": "direct | adjacent | emerging | aspirational",
  "one_liner": "what they are, in one honest sentence",
  "positioning":        { "value": "...", "evidence": "url", "confidence": "high|med|low" },
  "icp_segment":        { "value": "who they're really for", "evidence": "url", "confidence": "..." },
  "pricing_packaging":  { "model": "seat|usage|flat|freemium|…", "tiers": "...", "anchor_price": "...", "notes": "...", "evidence": "url", "confidence": "..." },
  "core_features":      [ "feature — one line each" ],
  "differentiators":    [ "what they lead with / claim as unique" ],
  "ux_quality":         { "value": "onboarding, polish, speed — from reviews/trials", "evidence": "url", "confidence": "..." },
  "gtm_distribution":   { "motion": "PLG|sales-led|partnerships|community", "channels": "...", "evidence": "url", "confidence": "..." },
  "tech_architecture":  { "stack_signals": "...", "api_extensibility": "...", "integrations": [ "..." ], "evidence": "url", "confidence": "..." },
  "compliance_security":{ "certs": [ "SOC2|HIPAA|ISO27001|…" ], "posture": "...", "evidence": "url", "confidence": "..." },
  "traction":           { "funding": "...", "customers_logos": "...", "growth_signals": "...", "team_size": "...", "evidence": "url", "confidence": "..." },
  "sentiment":          { "loved": [ "..." ], "hated": [ "..." ], "sources": [ "G2|Capterra|Reddit|HN|app-store url" ], "confidence": "..." },
  "recent_moves":       [ { "date": "YYYY-MM", "what": "...", "evidence": "url", "implication": "what it signals" } ],
  "roadmap_signals":    [ { "signal": "job post|changelog|blog|exec talk", "inferred_direction": "...", "evidence": "url", "confidence": "..." } ],
  "weaknesses_gaps":    [ "where they're soft — with evidence" ],
  "moat_defensibility": { "defensible": "what's genuinely hard to copy (network effects, data, switching cost, brand, regulatory)", "copyable": "what isn't", "confidence": "..." },
  "implications_for_us":[ "the so-what: how this should change OUR product / positioning / sequencing" ],
  "overall_confidence": "high | med | low",
  "sources_used":       [ "url", "url" ],
  "open_unknowns":      [ "what we couldn't determine and why it matters" ]
}
```

Empty/unknown fields: set value to `null` and add a line to `open_unknowns` — don't omit the key, and don't invent a value.

---

## Market / category schema

One object, returned by the market subagent(s). For the **deep** tier, split across several subagents (trends, segments, regulation, white-space) and merge.

```json
{
  "category": "what this market actually is",
  "jobs_to_be_done": [ "the real jobs customers hire this category for" ],
  "segments":        [ { "segment": "...", "size_signal": "...", "who_serves_it": "...", "evidence": "url" } ],
  "trends":          [ { "trend": "...", "direction": "rising|flat|declining", "evidence": "url", "implication": "..." } ],
  "value_shift":     "where value/margin is migrating in this category and why",
  "category_maturity": "emerging | growth | mature | declining",
  "regulatory_forces": [ "rules/standards shaping the space (e.g. HIPAA, PCI) + implication" ],
  "white_space":     [ { "unmet_need": "...", "evidence": "url", "why_open": "why incumbents haven't taken it", "how_we_could_win": "..." } ],
  "confidence": "high | med | low",
  "open_unknowns": [ "..." ]
}
```

`white_space` is the highest-value section — it's where the moat is built. `why_open` matters most: an unmet need no one serves is only an opportunity if there's a *reason* it's open that you can exploit (incumbent disincentive, technical barrier you can clear, segment too small for them but right for you). An unmet need with no `why_open` is usually a trap.

---

## Synthesis objects (orchestrator-side, not a subagent)

After the fan-out, the orchestrator produces these from the compact rows above — see `references/output-template.md` for how they render.

- **`competitive_matrix`** — competitors × the dimensions above, the at-a-glance grid.
- **`market_thesis`** — a *point of view*, 3–6 sentences: what the real game is, where it's going, and the one or two structural truths that should drive strategy. This is the artifact that proves understanding; if it reads like generic category description, it failed the depth bar.
- **`moat_thesis`** — for *us*: what we can make defensible that competitors can't easily copy, grounded in the `moat_defensibility` + `white_space` findings.
- **`recommendations`** — each: `{ action, type: feature|positioning|gtm|pricing|partnership, horizon: now|next|later, rationale, expected_impact, which_threat_or_whitespace_it_answers, confidence }`. These go through the red-team before finalizing.
