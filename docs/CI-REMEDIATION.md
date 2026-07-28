# CI Remediation — status & follow-ups

_Context: CI had been red on every recent PR (including #20, which merged anyway).
The failures were chronic **backend/infrastructure** debt, unrelated to the
frontend PRs they were blocking. PR #22 (`claude/new-session-h5t7gn`) fixed the
mechanical/contained issues and documented the rest as F-A/F-B/F-C. The CI
workflow (`.github/workflows/ci.yml`) runs only on pull requests._

**All three follow-ups from PR #22 are now resolved.** This document previously
still listed them as blockers long after they had been fixed, which is its own
kind of stale — a remediation doc that over-reports breakage sends people to
diagnose problems that no longer exist. Status below re-verified 2026-07-28.

## Job status

| Job | Status | Notes |
|-----|--------|-------|
| Frontend Check (ESLint + TS + Build) | 🟢 green | |
| Backend Lint (ruff + mypy) | 🟢 green | ~250 ruff findings resolved in PR #22 |
| Security Scan / Trivy | 🟢 green | |
| Backend Tests (pytest + coverage) | 🟢 green | suite runs; 82 tests collected. Was F-A |
| Terraform Validate | 🟢 green | dependency cycle broken. Was F-B |
| Docker Build Test | 🟢 green | CI targets match the real stage names. Was F-C |

---

## Resolved

### F-C — Docker Build Test → fixed 2026-07-20 (`0ce5cb6`)

`ci.yml` built both images with `--target production`, a stage neither
Dockerfile defines. Fixed by option 1 (align CI to the real stages) rather than
renaming the stages:

- `ci.yml:278` → `target: runtime` (matches `backend/Dockerfile`: `builder`, `runtime`)
- `ci.yml:294` → `target: runner` (matches `frontend/Dockerfile`: `deps`, `builder`, `runner`)

PR #22 warned the real image build had never run in CI and might surface further
errors behind the build-definition fix. It did not — the job has been green since.

### F-A — Backend Tests → fixed 2026-07-28 (`8ffea21`)

pytest failed at **collection** because `app/scoring/engine.py:34` imported
`get_weights_for_asset_type` from `app.scoring.weights`, which never defined it.
The function now exists at `weights.py:85` and the suite is importable.

The warning that this was "resurrect a never-run suite, not a one-line fix" was
accurate: `8ffea21`'s message is *"make the backend suite real again"*, and it
carried the surrounding work, not just the missing function.

Current state: **82 tests collected, suite passes in CI.** Verified locally on
2026-07-28 at 67 passed / 15 errored, where all 15 errors are
`ConnectionRefusedError` on `127.0.0.1:5432` — CI supplies Postgres through
GitHub Actions `services:` (`timescale/timescaledb:latest-pg15`), which a plain
local checkout does not have. Those 15 are not judged from a local run.

### F-B — Terraform Validate → fixed 2026-07-28 (`8ffea21`)

The `kms → iam_role → eks → kms` cycle is broken, and broken the safe way PR #22
argued for rather than by widening the key policy: `aws_kms_key.fn`'s policy now
carries only the account-root statement, with a comment at `main.tf:149-153`
explaining why no per-role statement may be added back. The backend role gets
`kms:Decrypt` / `GenerateDataKey` / `DescribeKey` from its own identity policy
(`iam.tf:112-120`, scoped to `aws_kms_key.fn.arn`), which removes the kms→role
edge without granting anything broader.

The Terraform CLI stays pinned at 1.9.8 (`ci.yml:366`) for the cross-variable
`validation` block.

Note: the KMS resource is `aws_kms_key.fn`, not `.caep` — renamed in the
2026-07-28 rebrand (`b8fc320`). PR #22's cycle description used the old name.

---

## Open

### Coverage floor is below where it should be

`ci.yml` runs pytest with `--cov-fail-under=45` against a measured ~51%. The
inline comment is explicit that this is measured reality rather than a target,
and that raising it should come with new tests instead of a broken gate. That
work is still outstanding.

**Inconsistency worth fixing alongside it:** `backend/pyproject.toml:67` still
sets `addopts = "... --cov-fail-under=80"`. CI overrides it on the command line,
so a developer running a bare `pytest` locally fails an 80% gate that CI does not
enforce — the local run reports *"Required test coverage of 80% not reached"* on
a suite CI calls green. Pick one number and let both read it.

### eks module pinned to v19

`infrastructure/terraform/eks.tf:7` pins `terraform-aws-modules/eks/aws` at
`~> 19.21` to match the existing `aws_auth_*` arguments. Migrating to v20
(`authentication_mode` + `access_entries`) remains a separate, deliberate
follow-up — unchanged since PR #22.
