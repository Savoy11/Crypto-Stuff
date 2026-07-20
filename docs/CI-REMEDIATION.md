# CI Remediation — status & follow-ups

_Context: CI had been red on every recent PR (including #20, which merged anyway).
The failures were chronic **backend/infrastructure** debt, unrelated to the
frontend PRs they were blocking. PR #22 (`claude/new-session-h5t7gn`) fixes the
mechanical/contained issues and documents the rest. The CI workflow
(`.github/workflows/ci.yml`) runs only on pull requests._

## Job status after PR #22

| Job | Status | Notes |
|-----|--------|-------|
| Frontend Check (ESLint + TS + Build) | 🟢 green | was already passing |
| Backend Lint (ruff + mypy) | 🟢 green | ~250 ruff findings resolved; see below |
| Security Scan / Trivy | 🟢 green | |
| Backend Tests (pytest) | 🔴 red | migrations now pass; blocked on pre-existing app bug — see F-A |
| Terraform Validate | 🔴 red | 3 layers fixed; blocked on a dependency cycle — see F-B |
| Docker Build Test | 🔴 red | Dockerfile/CI target mismatch — see F-C (**priority**) |

## Fixed in PR #22

- **Terraform CLI pin** `1.6.6 → 1.9.8` — `variables.tf` uses a cross-variable
  reference in a `validation` block, allowed only from TF 1.9.
- **Terraform WAF blocks** — `main.tf` had single-line nested blocks
  (`override_action { none {} }`, `action { block {} }`); rewritten multi-line.
- **Terraform `fmt`** — normalized 6 files for 1.9.8's stricter formatter.
- **Terraform eks module** pinned `~> 20.4 → ~> 19.21` to match the v19-style
  `aws_auth_*` arguments the config uses (see F-B for the follow-on decision).
- **Migration enum double-create** (`001_initial.py`) — enums were created
  explicitly and then again by inline `sa.Enum(...)` columns → `type "userrole"
  already exists`. Now `create_type=False` + shared enum objects.
- **Migration duplicate constraint** (`002_scoring_fixes.py`) — re-added a
  UNIQUE constraint that `001` already creates → made idempotent
  (`DROP CONSTRAINT IF EXISTS` first).
- **Backend lint** — F401/I001/format across the backend, plus mechanical
  E712/UP038/C416/B904/B007, dead-code F841 removals, and the
  `CAEPException → CAEPError` (N818) rename.
- **Re-export regression fix** — ruff's F401 autofix had stripped re-exports
  from 6 package `__init__.py` files; restored, and `per-file-ignore`
  (`"__init__.py" = ["F401"]`) added to `backend/pyproject.toml` so it can't recur.

---

## Follow-ups (prioritized)

### F-C — Docker Build Test  ⭐ PRIORITY (decision: keep Docker)

**Decision:** stay on Docker; troubleshoot when local Docker access is available
(build verification needs a running daemon).

**Exact first error (from CI):**
```
ERROR: failed to solve: target stage "production" could not be found
```
**Root cause (already diagnosed, static — no daemon needed):** `ci.yml` builds
both images with `--target production`, but neither Dockerfile defines that stage:
- `backend/Dockerfile` stages: `builder`, `runtime`
- `frontend/Dockerfile` stages: `deps`, `builder`, `runner`
- `ci.yml:265` and `ci.yml:279` both pass `target: production`

**Fix options** (either works; pick one convention):
1. Align CI to the real stages — backend `target: runtime`, frontend `target: runner`; or
2. Add `AS production` as the final stage name in both Dockerfiles (or alias it).

**Expect more behind it:** this only unblocks the *build definition*. The actual
image build (pip install, `next build`, etc.) has never run in CI and may surface
further errors — verify locally with Docker before assuming green.

### F-A — Backend Tests (pytest)

`alembic upgrade head` now passes (both migration fixes above). pytest then fails
at **collection** on a pre-existing bug — confirmed absent from `main`, i.e. not
introduced here:
```
ImportError: cannot import name 'get_weights_for_asset_type'
from 'app.scoring.weights'   (imported at app/scoring/engine.py:31)
```
`weights.py` defines `ScoringWeights`, `DEFAULT_WEIGHTS`, `RISK_BAND_THRESHOLDS`,
`CONFIDENCE_THRESHOLDS` — but never `get_weights_for_asset_type`. The scoring
engine has therefore never been importable; the test suite has **never run** in CI
(the migration always died first, masking this).

**Needs the scoring-module owner** to decide: implement
`get_weights_for_asset_type(asset_type)` (per how `engine.py` uses it) or fix the
import. Likely more import/logic bugs and real test-assertion failures behind it —
this is "resurrect a never-run suite," not a one-line fix.

Note: the pytest DB comes from GitHub Actions `services:` (Postgres/Redis) on the
runner — **not** local Docker — so this is unblocked by the Docker decision.

### F-B — Terraform Validate

After the CLI/WAF/eks fixes, `terraform validate` now builds the full graph and
reports a **dependency cycle** among the security resources:
```
aws_kms_key.caep  →  aws_iam_role.backend  →  module.eks  →  aws_kms_key.caep
```
- `aws_kms_key.caep` key policy names `aws_iam_role.backend` as a principal (`main.tf:153`)
- `aws_iam_role.backend` trusts the EKS OIDC provider (`iam.tf` — `module.eks.oidc_provider_arn`)
- `module.eks` uses `aws_kms_key.caep.arn` for secret encryption (`eks.tf:25`)

**Needs a security-infra decision.** Typical break: grant the role KMS access via
an IAM policy on the role + an account-root key policy, instead of naming the role
directly in the key policy (removes kms→role edge). Do this deliberately — a naive
break can widen the key policy and weaken posture.

Also open: the eks module is pinned back to v19.21 to match the existing
`aws_auth_*` config. Migrating to v20 (`authentication_mode` + `access_entries`)
is a separate, deliberate follow-up.
