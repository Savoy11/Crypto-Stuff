# AWS provisioning runbook

**Written 2026-08-07.** How to stand up the Finance Now staging and production
environments from a clean AWS account, and what had to be fixed first.

This must be run **on a machine with AWS credentials for the target account**. None of
it can run from CI, because CI's whole purpose is to assume a role that does not exist
until step 2 completes.

---

## Read this first: the deploy has never worked

`CD — Deploy to Staging` has run on every push to `main` since 2026-07-18 and **failed
every single time** — 90 runs, zero successes. It was never a regression; the workflows
were committed complete against infrastructure that was never provisioned, and the
failure was invisible because nobody checks post-merge push runs.

The root cause was a single unset secret (`AWS_ACCOUNT_ID`), which rendered the role ARN
as `arn:aws:iam:::role/...` and produced `Could not assume role with OIDC: Request ARN is
invalid` after a two-minute retry. But fixing only that would have moved the failure two
steps down the pipeline, because **ten** distinct defects sat between the repository and
a working deploy. All ten are fixed in the change that added this file; they are listed
in "What was fixed" at the bottom so a future reader knows the reasoning.

**One check could not be run here and must be run by you:** `terraform validate`. The
container this was prepared in blocks `registry.terraform.io`, so neither provider schemas
nor the `terraform-aws-modules/vpc` and `.../eks` community modules could be downloaded.
`terraform fmt -check -recursive` passes, so the HCL parses, but **type-level errors would
not have been caught**. Run `terraform validate` before your first `apply` and expect to
fix a small number of things this pass could not see.

---

## What this costs

At the committed defaults, roughly **$1,350/month** at list price in `us-east-1`, before
data transfer and storage:

| Component | Config | ≈ $/mo |
|---|---|---|
| EKS control plane | one cluster per environment | 73 |
| On-demand node group | 3 × `m6i.large` | 210 |
| Spot node group | 2 × `m6i.large` spot | 44 |
| Aurora PostgreSQL | 2 × `db.r6g.large` | 380 |
| ElastiCache Redis | 3 × `cache.r6g.large` | 451 |
| NAT gateways | one per AZ (`single_nat_gateway = false`) | 99 |
| Interface VPC endpoints | 3 endpoints × 3 AZ | 66 |
| ALB, WAF, KMS, Secrets Manager | | ~32 |

**That is per environment.** Applying both staging and production doubles it.

If that is more than intended, the levers — in descending order of saving — are
`redis_num_cache_clusters = 1`, Aurora Serverless v2 (already stubbed at `rds.tf:191-193`),
`single_nat_gateway = true`, and dropping the on-demand node group to spot-only.

---

## Step 0 — Prerequisites

- Terraform ≥ 1.9.0
- AWS CLI v2, authenticated against the target account with administrative rights
  (this creates IAM roles, an OIDC provider, KMS keys and a VPC)
- `kubectl` ≥ 1.29 and `helm` ≥ 3.14 to verify afterwards

Confirm you are pointed at the right account before anything else — every step below is
account-wide:

```bash
aws sts get-caller-identity
```

Record the `Account` value. It is the `AWS_ACCOUNT_ID` secret in step 4.

---

## Step 1 — Bootstrap the Terraform state backend

The root module keeps state in S3 with DynamoDB locking, so the bucket, lock table and
KMS key must exist before its first `init`. Nothing created them, which is why the root
module could never be initialised from a clean account. `bootstrap/` does exactly that
and nothing else, and keeps its own state locally — a module that creates the remote
backend cannot itself live in it.

```bash
cd infrastructure/terraform/bootstrap
terraform init
terraform apply
```

Creates `fn-terraform-state` (versioned, KMS-encrypted, public access blocked,
TLS-only), `fn-terraform-locks`, and `alias/fn-terraform-state`.

Both the bucket and the lock table carry `prevent_destroy`. Losing state is worse than
any cleanup it would save.

> The local `terraform.tfstate` this produces is gitignored and should stay that way. It
> records three resources, all trivially re-importable.

---

## Step 2 — Apply staging

`key` is deliberately absent from the backend block: a backend cannot take variables, so
a hardcoded key means both environments share one state file and applying staging would
adopt and then destroy production. Pass it per environment instead.

```bash
cd infrastructure/terraform

terraform init -reconfigure -backend-config="key=staging/terraform.tfstate"
terraform validate          # <-- the check that could not run in the prep container
terraform plan  -var="environment=staging" -out=staging.tfplan
terraform apply staging.tfplan
```

Expect 20–25 minutes, most of it the EKS control plane and the Aurora cluster.

This creates, among much else:

- the account's **GitHub OIDC provider** (`token.actions.githubusercontent.com`)
- `fn-staging-cicd-deploy-role`, trusting **only** `repo:Savoy11/Finance-Now:*`
- the `fn-deployers` ClusterRole and binding that make the `aws-auth` mapping mean
  something
- ECR repositories `fn-staging/backend` and `fn-staging/frontend`

If your repository is not `Savoy11/Finance-Now`, pass
`-var="github_repository=owner/repo"`. This value is the only thing standing between the
deploy role and any workflow on GitHub, so it is exact by design — do not widen it to a
bare owner.

---

## Step 3 — Apply production

An AWS account can hold exactly one OIDC provider per URL, so the second environment must
reuse the one staging created rather than try to create its own:

```bash
terraform init -reconfigure -backend-config="key=production/terraform.tfstate"
terraform validate
terraform plan \
  -var="environment=production" \
  -var="manage_github_oidc_provider=false" \
  -out=production.tfplan
terraform apply production.tfplan
```

Omitting `manage_github_oidc_provider=false` fails with `EntityAlreadyExists`.

> Skip this step if you only want staging. Nothing in staging depends on it.

---

## Step 4 — Set the GitHub secrets

Settings → Secrets and variables → Actions. Both CD workflows now fail in seconds with a
named error if `AWS_ACCOUNT_ID` is missing, rather than after a two-minute OIDC retry.

| Secret | Needed for | Where it comes from |
|---|---|---|
| `AWS_ACCOUNT_ID` | **Required.** Every AWS step in both CD workflows | `aws sts get-caller-identity` |
| `SLACK_BOT_TOKEN` | The Notify Slack job (currently fails with `Need to provide at least one botToken or webhookUrl`) | Slack app OAuth token |
| `SLACK_DEPLOY_CHANNEL_ID` | Which channel that job posts to | Slack channel ID |
| `STAGING_SMOKE_TEST_KEY` | Authenticated smoke tests after deploy | Your own value |

Only `AWS_ACCOUNT_ID` blocks a deploy. The other three affect the notify and smoke-test
jobs, which are why a run can still show red after a successful deploy.

---

## Step 5 — Verify

```bash
# The CI role is mapped AND bound — both matter, and only the second was ever missing
aws eks update-kubeconfig --region us-east-1 --name fn-staging-eks
kubectl get clusterrolebinding fn-deployers
kubectl describe configmap aws-auth -n kube-system | grep -A3 fn-cicd

# The repos the workflow pushes to
aws ecr describe-repositories --query 'repositories[].repositoryName'
# expect fn-staging/backend, fn-staging/frontend

# The role the workflow assumes
aws iam get-role --role-name fn-staging-cicd-deploy-role \
  --query 'Role.AssumeRolePolicyDocument'
# confirm the sub condition names your real repo, not your-org/finance-now
```

Then trigger a deploy and watch it rather than assuming:

```
Actions → CD — Deploy to Staging → Run workflow
```

**Check the push run, not just the PR checks.** That distinction is the entire reason
this went unnoticed for three weeks.

---

## What was fixed to make this possible

All ten were confirmed against the files, not inferred. None were caused by the
application code.

| # | Defect | Fix |
|---|---|---|
| 1 | `AWS_ACCOUNT_ID` unset → `arn:aws:iam:::role/...` | Step 4, plus a preflight that fails by name in seconds |
| 2 | CI/CD role name disagreed three ways: Terraform created `fn-staging-cicd-deploy-role`, the workflows assumed `fn-cicd-deploy-role`, and `aws-auth` mapped a third literal | `eks.tf` now references `aws_iam_role.cicd_deploy.arn`; workflows use an env-scoped `CICD_ROLE_NAME` |
| 3 | The GitHub OIDC provider was trusted but never created | `aws_iam_openid_connect_provider.github`, toggleable for the second environment |
| 4 | OIDC subject was the template placeholder `repo:your-org/finance-now:*` | `var.github_repository`, validated, defaulting to the real repo |
| 5 | `fn-deployers` was mapped in `aws-auth` but bound to no RBAC role, so the deploy would authenticate and then be denied every `kubectl apply` | `kubernetes_cluster_role` + binding, created by Terraform because the pipeline would need the permission to grant itself the permission |
| 6 | Manifests pulled `${ECR_REGISTRY}/fn-backend`; images are pushed to `fn-staging/backend` → `ImagePullBackOff` | Manifests take `${ECR_REPO_BACKEND}` / `${ECR_REPO_FRONTEND}`, added to both `envsubst` allowlists |
| 7 | ECR is `IMMUTABLE` but both workflows pushed `:latest` every run → second deploy fails with `ImageTagAlreadyExistsException` | `:latest` dropped; nothing consumed it |
| 8 | Production promotes `fn-staging/*` → `fn-production/*`, but the CI policy scoped ECR to its own environment → promotion denied | Read widened to the project's repository namespace; push still scoped to the environment's own repos |
| 9 | Backend `key` hardcoded to `production/terraform.tfstate` → staging would clobber production state | Partial backend config, passed per environment at init |
| 10 | The state bucket, lock table and KMS key had to exist before the first `init`, and nothing created them | `bootstrap/` |

**Not fixed, flagged instead:** `cd-staging.yml` still passes a
`NEXT_PUBLIC_WS_URL` build arg, but the app opens no socket and that variable was removed
in the M8 sweep (`CLAUDE.md`, Environment Variables). It is inert rather than wrong, and
removing it belongs with a frontend change, not this one.
