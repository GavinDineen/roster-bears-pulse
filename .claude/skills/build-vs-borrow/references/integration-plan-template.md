# Integration-plan template

The deliverable of this skill's **ADOPT** mode. Fill every section from what you read at the repo's call site during
INTAKE — a plan that could describe any repo is a failed plan. Keep it tight; this is a plan to act
on, not a report to file.

```markdown
# Adopt: <thing> → <winning repo/package>

**Pick:** `<owner/repo>` (<language>, <license>, <stars>★, last push <N>d ago)
**Adopt-style:** DEPEND | VENDOR-AND-AMEND | FORK
**Why this one:** <one paragraph — fit for our call site + health + license. Name the runner-up
and why we didn't pick it.>

## 1. Install / vendor
<DEPEND>   `npm install <pkg>@<version>`   (pin the version)
<VENDOR>   copy `<src path in upstream>` → `<dest path in our repo>` @ commit `<sha>`
           provenance: <url>#<sha>, license <SPDX> — add to NOTICE/attribution
<FORK>     fork <url> → <our-org/fork>, branch `<name>`, patch: <what>

## 2. Wire-up (files in THIS repo)
- `<path/to/file>` — <create|edit>: <the adapter/wrapper that matches our existing
  `<pattern you saw>` and adapts <upstream API> to <our call-site shape>>
- `<path/to/callsite>` — swap <current placeholder/TODO> for a call to the adapter
- config/env: <VARS or settings the package needs>

## 3. Verify (the one runnable proof)
<the exact command / test / script that exercises the real path and shows it works —
e.g. `npm test path/to/new.test.ts`, or a curl through the endpoint, or a repro script>

## 4. Rollback
<how to cleanly back it out: `npm uninstall <pkg>` + revert the adapter; or delete the vendored
dir + the attribution line>

## 5. Watch-outs
- License obligations: <attribution / NOTICE / copyleft boundary>
- Transitive weight: <heavy deps this pulls in, if any>
- Security: <Scorecard/CVE flags> — **PHI/payments surface? route through sr-security-auditor
  before adopting.**
```

## Notes
- **Specificity is the whole value.** "Add an adapter" is useless; "add `src/lib/pdf/adapter.ts`
  wrapping `pdf-lib`'s `PDFDocument` to return our existing `RenderedDoc` shape used at
  `src/routes/export.ts:42`" is the plan. If you can't be that specific, you didn't read the call
  site — go back to INTAKE.
- **Verify is non-negotiable for anything non-trivial.** A borrowed component that was never run
  through the real path is an unfinished borrow.
