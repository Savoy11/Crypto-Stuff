# Scaling Runbook

## Horizontal Pod Autoscaling (HPA)

The backend HPA is pre-configured (`infrastructure/kubernetes/backend/hpa.yaml`):
- Min replicas: 3
- Max replicas: 20
- Scale-up trigger: CPU > 70% or Memory > 80%
- Scale-down stabilization: 300 seconds

Monitor HPA:
```bash
kubectl get hpa fn-backend-hpa -n fn -w
```

## Manual Scaling Events

**Anticipated high traffic** (institutional client onboarding, market events):
```bash
# Pre-scale before event
kubectl scale deployment fn-backend --replicas=10 -n fn
kubectl scale deployment fn-frontend --replicas=5 -n fn

# Verify
kubectl get pods -n fn | grep -E "backend|frontend"
```

## Database Scaling

**Add Aurora read replica**:
```bash
aws rds create-db-instance \
  --db-instance-identifier fn-reader-2 \
  --db-cluster-identifier fn-cluster \
  --engine aurora-postgresql \
  --db-instance-class db.r6g.large
```

## Redis Scaling

To increase Redis memory or add cluster nodes, update `infrastructure/terraform/elasticache.tf` and apply:
```bash
cd infrastructure/terraform
terraform plan -target=aws_elasticache_replication_group.redis
terraform apply -target=aws_elasticache_replication_group.redis
```

## Capacity Planning

| Component | Current | Limit | Scale Action |
|-----------|---------|-------|-------------|
| Backend pods | 3-20 | 20 | Increase HPA max |
| Postgres connections | ~100 | 1000 | Increase pool_size |
| Redis memory | 6 GB | 32 GB | Upgrade instance |
| TimescaleDB retention | 90 days | — | Extend retention policy |
