# Incident Response Runbooks

## Severity Classification

| Severity | Definition | Response Time |
|----------|-----------|---------------|
| **P0 - Critical** | Platform down / data integrity breach | 15 minutes |
| **P1 - High** | Major feature unavailable / significant data lag | 1 hour |
| **P2 - Medium** | Degraded performance / non-critical pipeline failure | 4 hours |
| **P3 - Low** | Minor issues / cosmetic bugs | Next business day |

---

## Runbook: Stablecoin Depeg Alert

**Trigger**: `depeg` alert with severity `critical` (>100 bps deviation).

**Step 1 — Verify**
```bash
# Check raw price from CoinGecko directly
curl "https://api.coingecko.com/api/v3/simple/price?ids=<coin-id>&vs_currencies=usd"

# Compare to Finance Now stored value
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.financenow.example.com/api/v1/market-data/<asset-id>/latest
```

**Step 2 — Assess Impact**
- Check DefiLlama for on-chain TVL changes
- Check Dune Analytics for redemption queue volume
- Verify alert was triggered from validated data source (not a bad data point)

**Step 3 — Validate Data Pipeline**
```bash
kubectl logs -l app=fn-backend -n fn | grep "coingecko" | tail -50
```

**Step 4 — Escalate if Confirmed**
- Page on-call analyst via PagerDuty
- Notify institutional clients via alert email if deviation > 200 bps for > 30 minutes
- Document in incident ticket

---

## Runbook: API Outage

**Trigger**: Error rate > 5% for 5+ minutes OR health check failing.

**Step 1 — Check pod status**
```bash
kubectl get pods -n fn
kubectl describe pod <failing-pod> -n fn
```

**Step 2 — Check logs**
```bash
kubectl logs -l app=fn-backend -n fn --tail=200 | grep "ERROR\|CRITICAL"
```

**Step 3 — Check database**
```bash
kubectl exec -it postgres-0 -n fn -- psql -U caep -c "SELECT count(*) FROM pg_stat_activity;"
# High connection count may indicate pool exhaustion
```

**Step 4 — Restart if necessary**
```bash
kubectl rollout restart deployment/fn-backend -n fn
kubectl rollout status deployment/fn-backend -n fn
```

**Step 5 — Scale up if load-related**
```bash
kubectl scale deployment fn-backend --replicas=10 -n fn
```

---

## Runbook: Database Failover

**Trigger**: Primary RDS instance unavailable.

Aurora automatically promotes a read replica within ~30 seconds. To verify:
```bash
aws rds describe-db-clusters --db-cluster-identifier fn-cluster \
  --query 'DBClusters[0].DBClusterMembers[*].{Instance:DBInstanceIdentifier,Writer:IsClusterWriter}'
```

If manual intervention is required:
```bash
aws rds failover-db-cluster --db-cluster-identifier fn-cluster
```

**Post-failover**: Update `DATABASE_URL` in Kubernetes secret if the writer endpoint changed.

---

## Alert Escalation Matrix

| Alert Type | P0 | P1 | P2 |
|-----------|----|----|-----|
| API health check failure | ✅ Page | | |
| Depeg > 200 bps | ✅ Page | | |
| Depeg 50–200 bps | | ✅ Notify | |
| DB connections > 90% | ✅ Page | | |
| Redis memory > 90% | | ✅ Notify | |
| Pipeline lag > 30 min | | ✅ Notify | |
| Score staleness > 1 hour | | | ✅ Ticket |
