# Kubernetes Deployment Guide

> **The cluster must exist first.** This guide assumes a provisioned environment. To
> create one from a clean AWS account — state backend, VPC, EKS, IAM, ECR — follow
> [`aws-provisioning.md`](./aws-provisioning.md). The normal path is the CD pipeline,
> not these commands; use these when deploying by hand or debugging a pipeline failure.

## Prerequisites

- Kubernetes cluster (EKS 1.29+ recommended)
- `kubectl` configured with cluster access
- `helm` v3+
- AWS CLI (for ECR image push)
- Docker

---

## Build and Push Images

Two things to get right, both of which the earlier version of this guide got wrong and
which fail in confusing ways:

- **The repository path is environment-scoped** — `fn-staging/backend`, not `fn-backend`.
  Terraform names them `${project_name}-${environment}/{backend,frontend}`. Pushing to
  `fn-backend` creates nothing; ECR rejects a push to a repository that does not exist.
- **Never tag `:latest`.** The repositories are `image_tag_mutability = IMMUTABLE`, so
  the second push of any given tag fails with `ImageTagAlreadyExistsException`. Tag by
  commit SHA (staging) or version (production), which is what the manifests reference.

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com"
ENVIRONMENT=staging          # or production
TAG=$(git rev-parse HEAD)    # or the version tag being released

# Authenticate to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin "$REGISTRY"

# Build and push backend
docker build -t "${REGISTRY}/fn-${ENVIRONMENT}/backend:${TAG}" ./backend
docker push "${REGISTRY}/fn-${ENVIRONMENT}/backend:${TAG}"

# Build and push frontend
docker build -t "${REGISTRY}/fn-${ENVIRONMENT}/frontend:${TAG}" ./frontend
docker push "${REGISTRY}/fn-${ENVIRONMENT}/frontend:${TAG}"
```

---

## Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f infrastructure/kubernetes/namespace.yaml

# Create secrets (fill real values first)
kubectl apply -f infrastructure/kubernetes/secrets.yaml

# Apply ConfigMap
kubectl apply -f infrastructure/kubernetes/configmap.yaml

# Deploy databases
kubectl apply -f infrastructure/kubernetes/postgres/
kubectl apply -f infrastructure/kubernetes/redis/

# Wait for DB to be ready
kubectl rollout status statefulset/postgres -n fn

# Deploy application services.
#
# The deployment manifests are templates — they carry ${ECR_REGISTRY},
# ${ECR_REPO_BACKEND}/${ECR_REPO_FRONTEND} and ${IMAGE_TAG} placeholders so one file
# serves both environments. Applying the directory directly would send the literal
# "${ECR_REGISTRY}/..." to the API server as an image name. Substitute first:
export ECR_REGISTRY="$REGISTRY"
export ECR_REPO_BACKEND="fn-${ENVIRONMENT}/backend"
export ECR_REPO_FRONTEND="fn-${ENVIRONMENT}/frontend"
export IMAGE_TAG="$TAG"

envsubst '${ECR_REGISTRY} ${ECR_REPO_BACKEND} ${ECR_REPO_FRONTEND} ${IMAGE_TAG}' \
  < infrastructure/kubernetes/backend/deployment.yaml | kubectl apply -f - -n fn
kubectl apply -f infrastructure/kubernetes/backend/service.yaml -n fn
kubectl apply -f infrastructure/kubernetes/backend/hpa.yaml -n fn

envsubst '${ECR_REGISTRY} ${ECR_REPO_BACKEND} ${ECR_REPO_FRONTEND} ${IMAGE_TAG}' \
  < infrastructure/kubernetes/frontend/deployment.yaml | kubectl apply -f - -n fn
kubectl apply -f infrastructure/kubernetes/frontend/service.yaml -n fn

# Apply ingress
kubectl apply -f infrastructure/kubernetes/ingress.yaml

# Verify all pods are running
kubectl get pods -n fn
```

---

## Post-Deployment: Run Migrations

```bash
# Run database migrations as a one-off Job
kubectl run alembic-upgrade \
  --image="${REGISTRY}/fn-${ENVIRONMENT}/backend:${TAG}" \
  --restart=Never \
  --env="DATABASE_URL=$(kubectl get secret fn-secrets -n fn -o jsonpath='{.data.DATABASE_URL}' | base64 -d)" \
  --command -- alembic upgrade head \
  -n fn

kubectl logs alembic-upgrade -n fn
kubectl delete pod alembic-upgrade -n fn
```

---

## Scaling

```bash
# Manual scaling
kubectl scale deployment fn-backend --replicas=5 -n fn

# HPA is pre-configured in infrastructure/kubernetes/backend/hpa.yaml
# It scales automatically between 3-20 replicas based on CPU/memory

# View HPA status
kubectl get hpa -n fn
```

---

## Health Checks

```bash
# Check pod health
kubectl describe pod -l app=fn-backend -n fn

# View logs
kubectl logs -l app=fn-backend -n fn --tail=100 -f

# Check service endpoints
kubectl get endpoints -n fn

# Test health endpoint
kubectl port-forward svc/fn-backend 8000:8000 -n fn &
curl http://localhost:8000/health
```

---

## Rolling Updates

```bash
# Update backend image
kubectl set image deployment/fn-backend \
  backend="${REGISTRY}/fn-${ENVIRONMENT}/backend:v1.1.0" \
  -n fn

# Monitor rollout
kubectl rollout status deployment/fn-backend -n fn

# Rollback if needed
kubectl rollout undo deployment/fn-backend -n fn
```
