# Kubernetes Deployment Guide

## Prerequisites

- Kubernetes cluster (EKS 1.29+ recommended)
- `kubectl` configured with cluster access
- `helm` v3+
- AWS CLI (for ECR image push)
- Docker

---

## Build and Push Images

```bash
# Authenticate to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push backend
docker build -t caep-backend ./backend
docker tag caep-backend:latest \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/caep-backend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/caep-backend:latest

# Build and push frontend
docker build -t caep-frontend ./frontend
docker tag caep-frontend:latest \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/caep-frontend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/caep-frontend:latest
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
kubectl rollout status statefulset/postgres -n caep

# Deploy application services
kubectl apply -f infrastructure/kubernetes/backend/
kubectl apply -f infrastructure/kubernetes/frontend/

# Apply ingress
kubectl apply -f infrastructure/kubernetes/ingress.yaml

# Verify all pods are running
kubectl get pods -n caep
```

---

## Post-Deployment: Run Migrations

```bash
# Run database migrations as a one-off Job
kubectl run alembic-upgrade \
  --image=<account-id>.dkr.ecr.us-east-1.amazonaws.com/caep-backend:latest \
  --restart=Never \
  --env="DATABASE_URL=$(kubectl get secret caep-secrets -n caep -o jsonpath='{.data.DATABASE_URL}' | base64 -d)" \
  --command -- alembic upgrade head \
  -n caep

kubectl logs alembic-upgrade -n caep
kubectl delete pod alembic-upgrade -n caep
```

---

## Scaling

```bash
# Manual scaling
kubectl scale deployment caep-backend --replicas=5 -n caep

# HPA is pre-configured in infrastructure/kubernetes/backend/hpa.yaml
# It scales automatically between 3-20 replicas based on CPU/memory

# View HPA status
kubectl get hpa -n caep
```

---

## Health Checks

```bash
# Check pod health
kubectl describe pod -l app=caep-backend -n caep

# View logs
kubectl logs -l app=caep-backend -n caep --tail=100 -f

# Check service endpoints
kubectl get endpoints -n caep

# Test health endpoint
kubectl port-forward svc/caep-backend 8000:8000 -n caep &
curl http://localhost:8000/health
```

---

## Rolling Updates

```bash
# Update backend image
kubectl set image deployment/caep-backend \
  backend=<account-id>.dkr.ecr.us-east-1.amazonaws.com/caep-backend:v1.1.0 \
  -n caep

# Monitor rollout
kubectl rollout status deployment/caep-backend -n caep

# Rollback if needed
kubectl rollout undo deployment/caep-backend -n caep
```
