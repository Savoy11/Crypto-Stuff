# Git repository audit — 2026-08-23

**Scope:** owner-commissioned — "how organized is the repo, and should I be concerned by the way
things have been saved up until this point." This is a **repository/history audit** (what git has
recorded, how it is organized, what is at risk), not a code-defect audit — the code-auditor's
fortnightly sweeps own that. Same evidence rule applies: every finding cites a command run in this
session and its output.

**Audited at:** `origin/main` = `0bd644e` ("Docs: branch and PR by default (#109)"), from a fresh
clone with all 62 remote heads fetched. **Method:** pure git archaeology + GitHub PR metadata —
none of it IP-dependent, so a remote run is a valid baseline for this audit (unlike the data
audits). Checks run: `git ls-files` inventories, junk-pattern scan, full-history secret scan
across **all refs** (454 commits), blob-size census, per-branch merge-base classification,
branch-kinship counts, EOL survey, GitHub PR listing.

**Workflow context (owner, 2026-08-24):** every change to every branch happens **within Claude
Code sessions** — no human pushes from a local machine. The repo's writers are agent sessions,
dependabot, and GitHub's merge button, and session containers are ephemeral. Three consequences
thread through the findings below: branch accumulation is structural, not neglect (one
designated branch per session — F2); the history reset was itself session-performed, which is
why it went unrecorded (F1); and the GitHub remote is the project's **only durable copy** — no
laptop holds an accidental backup (F2, step 7). It also means documentation-only policy binds
less than usual: each session starts fresh, so controls have to live in repo settings, not
prose (F4).

---

## Verdict

**Content hygiene: you should not be concerned — it is verifiably clean.** No secret has ever
been committed on any of the 62 branches. No junk, no build artifacts, no committed
`node_modules`, no OneDrive conflict copies. The pack is 2.83 MiB for 679 files. Line endings
are uniformly LF despite Windows development. Commit messages are unusually good.

**Continuity of the record: two structural problems deserve attention before anything else
touches the branch list.**

1. **`main`'s history was reset on 2026-08-05 and the reset is recorded nowhere.** Everything
   before PR #71 — the project's first ~10 weeks, ~354 commits — is reachable only through 34
   stale branches that no longer share an ancestor with `main`. Three places in the docs still
   say deleted features are "recoverable from git history"; for pre-reset deletions that is now
   only true through those stale branches. A routine "clean up old branches" pass would destroy
   the only convenient copy.
2. **Process debt has pooled on GitHub:** 61 branches for two active lines of work, 15 open PRs
   idling (14 dependabot — two with un-mergeable orphaned bases — plus one stale draft), and the
   new "branch and PR by default" policy exists only as documentation — nothing enforces it.
   Because every branch is created by a session, the buildup is the workflow's default output
   and will resume after any one-time cleanup unless the repo settings change with it (step 2).

Both are an afternoon of deliberate cleanup, in the order given in "Recommended sequence." The
one rule that matters: **archive before deleting** (§F2).

---

## What is healthy (checked, not assumed)

- **Secrets: clean across all history.** Scanned every commit reachable from every ref (454
  commits, 62 branches) for Anthropic/AWS/GitHub/Google/Slack key formats, private-key PEM
  blocks, and credential-bearing DB URLs. Every match is a dev default (`fn:fn@localhost`,
  `caep:caep@postgres`, CI's `fn_test_password` against a throwaway service container) or an
  explicit placeholder (`infrastructure/kubernetes/secrets.yaml` is a template whose header
  says exactly that; its Terraform sibling prints a literal `PASSWORD`). The runtime secret
  stores (`.provider-config.json`, `.agent-prompts.json`, `.env*`) are gitignored and have
  never appeared in history.
- **No junk.** A tracked-file scan for `.DS_Store`, `Thumbs.db`, logs, backups, editor swap
  files, OneDrive conflict copies, `node_modules/`, `.next/`, and `__pycache__` matched exactly
  one file: `backend/.env.example`, which belongs there.
- **Size is a non-issue.** 2.83 MiB pack. The largest blob is
  `frontend/src/lib/data/fundFacts.generated.json` (2.0 MB), committed **once** and never
  churned — a deliberate snapshot, not a growing liability. The next-largest are lockfiles and
  `docs/TASK-QUEUE.md` revisions, which delta-compress to nothing.
- **Line endings are uniform.** 672 of 679 files index as LF; the 7 exceptions are empty
  `__init__.py`s, a `.gitkeep`, one SQL migration, and the generated JSON (no trailing
  newline — cosmetic). There is no CRLF pollution to fix.
- **The `.gitignore`s are maintained, not boilerplate.** Root + `frontend/`, with reasoned
  comments, and generated artifacts get added as they appear (`91b66af` gitignored
  `audit.json`/`audit.txt` the day the generator landed).
- **Governance files exist and are thoughtful.** CI with 7 jobs (lint/test/build/security-scan/
  terraform-validate), a CODEOWNERS that honestly documents its own non-enforcement, and a
  dependabot config with deliberate grouping and reasoned major-version ignores.
- **Commit messages carry reasons**, not just labels ("fix(coins): one asset sort, not two —
  the second copy had the direction inverted"). Future archaeology will thank present you.

---

## Findings

### F1 · P1 — `main`'s history begins 2026-08-05; the reset that did it is recorded nowhere

**Evidence.** The root commit of `main` is `8bb8983` — a **616-file, 136,990-insertion
full-tree snapshot** carrying the squash-merge subject "P2-O5 (scorer half): options scorer to
agents, v1 API, and MCP (#71)", authored 2026-08-05, committer `GitHub <noreply>`. But the repo
is ~10 weeks older than that: PR #1 ("initial platform scaffold") closed **2026-05-24**, and PR
numbering is continuous (#1…#109) in this same repository. `git rev-list --count` reaches 100
commits from `main` but **454** across all refs. 34 of the 61 non-main branches return **no
common ancestor** with `main` (`git merge-base` fails) — they carry the pre-reset lineage.
`grep -ri "reset\|force-push" docs/ CLAUDE.md` finds no record of the event. (The
similarly-named `archive/wave-two-pre-reset` documents a different, smaller rollback on
2026-08-15 — that one was archived properly and is the model to copy.)

**What it silently broke.** Three recorded recoverability claims now depend on stale branches:

| Claim | Written at | Status |
|---|---|---|
| Risk Case Studies `/backtests` "Deleted (2026-07) … Recoverable from git history if ever wanted" | CLAUDE.md feature table | **Broken on `main`** — `git log origin/main -- 'frontend/src/app/(dashboard)/backtests/*'` returns nothing; the deletion commit `005c828` exists only on orphaned refs |
| "The deleted page is recoverable from git history" | `docs/assessments/T5-utility-triage.md:17` | Pre-reset — only via orphaned refs |
| "recoverable from git history (the /backtests precedent)" | `docs/TASK-QUEUE.md:1580` | Same |
| Retirement engine "recoverable from git history (`git log --diff-filter=D`)" | CLAUDE.md:641 | **Still true** — deleted 2026-08-20 (`6962cb6`), post-reset |

A fourth, sharper example: the prior audit report `docs/audits/2026-07-30-audit.md` opens with
"**Commit:** `14d6d76…` (branch `chore/improvement-agents`)". That commit is unreachable from
`main` — it survives on exactly three orphaned branches. The repo's own audit trail currently
cites history that `main` no longer contains.

**Where the old history survives today.** (a) The 34 orphaned branches — and
`claude/finance-now-7j8i2u` (264 commits, tip 2026-07-30) is a **superset of 11 of them**; the
other tips hold only 1–8 unique commits each (~24 commits total beyond the anchor). (b) GitHub's
immutable PR refs (`refs/pull/N/head` verified present for #1, #12, #45, #71) — a real but
obscure safety net: not fetched by default clones, invisible to `git log --all`.

**Not a finding of wrongdoing.** Resetting to a clean root before a production push is a
legitimate owner choice, and nothing of value in the *working tree* was lost. The defect is that
the decision is **unrecorded** while other records still assume the old history exists — the
same class of failure as a seeded terms verdict wearing a verified date.

**Given the workflow, the reset was performed by a session** — and that is precisely how it
went unrecorded: a session that isn't told to write a decision down loses it when the container
is reclaimed, and the next session inherits only what reached the repo. `archive/wave-two-pre-reset`
shows a session *can* do this right when instructed. The durable fix is a standing rule, in
CLAUDE.md's "How Changes Land": **any history-shaping operation — force-push, re-rooting `main`,
deleting branches, archiving a workstream — lands together with a dated note in `docs/`** saying
what was done and where the prior state lives. Sessions read CLAUDE.md at start; this is the one
place such a rule actually reaches every future writer.

### F2 · P1 — 61 stale-heavy branches, and the stale ones include the only complete copy of the pre-reset record

**Evidence.** `git ls-remote --heads origin` = 62 branches. Classification by
merge-base-with-main over all 61 non-main heads:

| Category | Count | Branches (abridged) | Disposition |
|---|---|---|---|
| Orphaned pre-reset lineage | **34** | `claude/finance-now-7j8i2u` (264 commits — the anchor), `feat/auth-phase0` (123), `claude/t2…t12-*` audit-wave set, `chore/improvement-agents`, `docs/risk-scale-spec`, `feat/live-data-audit`, 2 old dependabot heads | **Tag first, then delete** (commands below) |
| Connected, content already squash-merged | ~9 | `claude/branch-and-pr-default` (= #109), `wave-2-changes`, `wave-3-changes`, `claude/finance-wave-two-62esqa`, `claude/finance-alternatives-cost-zrft0z`, the Aug 7–16 `*-ojm76t`/`*-i0rsak` session branches | Delete after confirming each PR shows merged/closed |
| Dependabot, connected | 12 | current open dependency PRs | Leave — dependabot manages them; they auto-delete on close |
| Deliberate archive | 1 | `archive/wave-two-pre-reset` (7 unique commits incl. the first retirement build) | **Keep** — this is the pattern F1 should have followed |
| Open work | 2+ | `main`, `claude/p3-w1-provenance-note-ojm76t` (= open draft PR #89) | Decide PR #89 before touching its branch |

**Why the list looks like this.** Claude Code on the web creates one designated branch per
session, slug-named from the prompt — the 40 `claude/*` heads are session artifacts, not
carelessness (`claude/girls-repos-management-i0rsak` beside `claude/git-repo-management-i0rsak`
is the same task slugged twice, typo included). That also means the count grows by one with
every session and will regrow after any one-time purge; the systemic half of the fix is the
repo setting in step 2, not the purge itself.

**The risk — higher here than in a normal repo.** GitHub's "delete stale branches" affordances
and every generic cleanup script key on age and merge status. Run one, and the 34 orphaned
branches — the only branch-reachable copy of ~354 commits — vanish. PR refs would still hold
the objects, but nothing in the repo would point at them and no clone would fetch them. And
because all work happens in ephemeral session containers, **there is no developer machine
anywhere holding an accidental clone of the old history** — the usual last-resort backup a
team repo has by accident, this repo does not have at all. The GitHub remote is the single
durable copy of the entire project, which is why step 1 (archive tags) and step 7 (offline
mirror) exist.

### F3 · P2 — 15 open PRs are idling, in exactly the way dependabot.yml predicted would be fatal

**Evidence.** Open: 14 dependabot PRs + draft #89 (untouched since 2026-08-16). The dependabot
set splits into: 4 grouped patch/minor PRs (#92, #94, #90, and mcp typescript) that are the
low-risk batch, and **majors that each need a real decision**: typescript 5→7 (#54, #47),
recharts 2→3 (#52 — the app's primary chart library), zod 3→4 (#91 — mcp-server's validation
layer), lucide-react 0.358→1.31 (#93), redis 5→8 (#97), pytest 8→9 (#98), faker (#96), mypy
(#95), node 22→26 base image (#45). Two of them — **#45 and #52, both opened 2026-07-30 — sit
on orphaned pre-reset bases** (their heads share no ancestor with today's `main`) and can no
longer merge as-is; they need `@dependabot recreate`, not a rebase.

`dependabot.yml`'s own header says why this matters: grouping was chosen because ungrouped PRs
"would be ignored, which is worse than not running it." The oldest majors have now been open 24
days. The config's predicted failure mode is the current state — including for the three
security-relevant ecosystems the config exists to protect (the header cites the CVSS 9.1
next-auth week as its founding argument).

### F4 · P2 — "branch and PR by default" is documentation, not enforcement

**Evidence.** All 14 direct-to-`main` commits in the repo's current history landed on **one
day, 2026-08-22** — including the two rollout-scope changes CLAUDE.md's "How Changes Land"
section names as the reason the policy exists ("Hide Wallets from the initial rollout",
"withhold transfer-fees"). The policy doc merged the same day (#109). Nothing has changed on
the GitHub side: CODEOWNERS' own header states "Until then this file is a routing declaration,
not a gate," and there is no branch-protection rule requiring a PR. There are also **0 tags**,
which means `cd-production.yml` (tag-triggered) has never been runnable — the deploy pipeline
is dormant by construction, not by decision.

**In an all-sessions workflow this gap matters more than usual.** CLAUDE.md steers sessions,
but a session told in the moment to push to `main` will comply, and every session starts fresh —
prose cannot bind the next writer the way a setting can. A branch-protection rule is the one
control that reaches every future session automatically. It also improves the exception path:
"owner asks for direct-to-main" becomes "owner deliberately lifts the rule," which leaves a
trace instead of a surprise — the Aug-22 burst would have been a PR.

### F5 · P3 — small organization warts

- **`docs/audit/` vs `docs/audits/`.** Two audit files (`app-audit-2026-07-27.md`,
  `production-readiness-scorecard.md`) are stranded in the singular directory while the
  code-auditor charter, CODEOWNERS, and all newer reports use the plural. A reader following
  the charter's "prior reports live in `docs/audits/`" misses half the record.
- **CLAUDE.md's working-directory line is stale.** It names
  `C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend`, but the repo root is the
  `Finance-Now` monorepo (frontend is a subdirectory). Since no commits originate from the
  local machine, the classic OneDrive-corrupts-`.git` risk is mostly moot for a run-only
  checkout — the sharper storage concern is the flip side, covered in F2 and step 7: with no
  human clones, GitHub is a single point of storage. The doc line should simply say which
  layout is real.
- **No `.gitattributes`.** The uniform-LF state currently depends on every clone's
  `core.autocrlf` being configured right — on a Windows machine, one misconfigured clone away
  from a whole-file-diff incident. One line (`* text=auto`) locks in what is already true.
- **Backend + infrastructure are dormant weight** (102 + 32 files; last non-rename, non-deps
  change predates the current history) beside a frontend that CLAUDE.md says runs live-only
  without them. This is *documented* (optional legacy backend), so it is an observation, not a
  defect — but CI spends 3 of its 7 jobs (backend lint/test, terraform-validate) on every push
  validating it.

---

## Recommended sequence

Owner actions, in order — well under an hour, and the order is the point: **1 before 2, always.**
Steps 1–3 can each be handed to a session verbatim; steps 2's setting, 4, and 7 are things only
the owner can do (GitHub settings and the local machine sit outside any session's reach).

**1. Record and archive the reset (before any branch is deleted).**

```bash
# Anchor the pre-reset mainline under a tag (tags don't clutter the branch list):
git fetch origin
git tag archive/pre-reset-main origin/claude/finance-now-7j8i2u

# The nine tips holding commits the anchor lacks (1–8 commits each):
for b in claude/responsive-usability claude/crypto-analytics-platform-cZIf6 \
         claude/blockchain-discussion-2meymb claude/caep-profitability-feedback-dw7e8x \
         claude/caep-staking-page-listings-o6z6x0 feat/live-data-audit \
         claude/asset-class-connectors-lqfbnu claude/website-work-tg4ggg \
         docs/risk-scale-spec; do
  git tag "archive/pre-reset/${b##*/}" "origin/$b"
done
git push origin --tags
```

Then add three sentences to the docs recording that `main` was re-rooted on 2026-08-05 at #71
and that pre-reset history lives under `archive/pre-reset-*` tags — and repoint the two broken
"recoverable from git history" claims (CLAUDE.md `/backtests` row, `TASK-QUEUE.md:1580`) at the
tag. While in CLAUDE.md, add the standing rule from F1: history-shaping operations land with a
dated note in `docs/`, in the same commit. Caution: pushing the first tag matching `v[0-9]+.*`
would trigger `cd-production.yml` — the `archive/…` names above deliberately don't.

**2. Delete branches — only after step 1's tags are pushed.** The 34 orphaned branches are then
safe to delete wholesale; the ~9 squash-merged session branches after a glance at each PR's
merged/closed state; keep `archive/wave-two-pre-reset`, `main`, dependabot's heads, and #89's
branch until that PR is decided. Then stop the regrowth at the source: enable **Settings →
General → "Automatically delete head branches"**, so every future session branch is removed the
moment its PR merges. The setting only ever deletes a just-merged PR's head — it cannot touch
the orphaned pre-reset branches (no merged PRs), so it composes safely with the archive-first
rule.

**3. Triage the 15 open PRs.** Merge the grouped patch/minor PRs first; comment
`@dependabot recreate` on #45 and #52 (orphaned bases); schedule or explicitly close each major
(recharts 3 and zod 4 are breaking for the chart stack and mcp-server respectively); finish or
close draft #89. And note the structural half: in this workflow, dependency PRs only move when
a session is asked to move them — so make the ask recurring (a periodic "triage dependabot"
session, weekly to match the config's cadence), or the queue re-forms exactly as it did.

**4. Turn the policy into a setting.** Branch protection on `main`: require a pull request
before merging (a solo owner can still self-approve; the gate is against the accidental case),
optionally require the `ci-success` check. While in Settings, enable secret-scanning **push
protection** — this audit found nothing in history; push protection keeps it that way at zero
ongoing cost.

**5. Fold `docs/audit/` into `docs/audits/`** (two `git mv`s) and fix the CLAUDE.md
working-directory line.

**6. Add `.gitattributes`** with `* text=auto`.

**7. Keep one copy that isn't GitHub.** Because all work happens in ephemeral sessions, the
GitHub remote is currently the project's only durable copy (F2). Once — and occasionally
after — run on the local machine, somewhere outside OneDrive:

```bash
git clone --mirror https://github.com/Savoy11/Finance-Now.git   # first time
git -C Finance-Now.git remote update                            # refreshes
```

A mirror clone carries every branch and tag, so after step 1 it preserves the pre-reset history
too. Five minutes a month buys an independent backup of the single point of storage.

---

*Report produced from a fresh clone; no working-tree changes were made beyond adding this file.
Branch deletions, tags, settings changes, and PR actions are deliberately left to the owner —
every one of them is destructive or outward-facing.*

*Revised 2026-08-24 with owner-supplied workflow context — all branch changes originate in
Claude Code sessions — which reframed F1 (the reset was session-performed; added the standing
record-keeping rule), F2 (branch growth is structural; added the auto-delete setting and raised
the single-copy stakes), F4 (settings bind sessions where prose cannot), F5 (OneDrive risk
downgraded for a run-only checkout), and added step 7.*
