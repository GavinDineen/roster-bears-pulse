# Skill failure modes — symptom → cause → fix

> Extracted from SKILL.md MODE 2 (2026-07-10). Consult when diagnosing a
> skill that isn't performing; add rows as new failure classes appear.

| Symptom | Likely cause | Fix |
|---|---|---|
| Skill produces generic output | Body too vague, no examples | Add concrete examples; sharpen the diagnostic steps |
| Skill over-engineers / thrashes | Body has rigid over-structured steps the model fights | Strip constrictive MUSTs; explain the why instead |
| Skill ignores key constraint | Constraint buried mid-body | Surface it; if safety/correctness, make it a hard rule |
| Output inconsistent run-to-run | No output template | Add an explicit output structure |
| Skill repeats the same setup work every run | Missing bundled script | Write it once into `scripts/` |
