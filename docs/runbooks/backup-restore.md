# Backup and Restore Runbook

## Backup Strategy

| Data | Method | Frequency | Retention |
|------|--------|-----------|----------|
| PostgreSQL (RDS Aurora) | Automated snapshots | Daily | 7 days |
| PostgreSQL (manual) | `pg_dump` via cronjob | Hourly | 24 hours |
| Redis | AOF + RDB snapshots | On write + hourly | 24 hours |
| Application code | Git + ECR images | Every commit | Indefinite |

## PostgreSQL Backup

### Automated (AWS RDS)
Aurora automated backups are enabled with 7-day retention. To list available backups:
```bash
aws rds describe-db-cluster-snapshots \
  --db-cluster-identifier caep-cluster \
  --query 'DBClusterSnapshots[*].{Id:DBClusterSnapshotIdentifier,Time:SnapshotCreateTime}'
```

### Manual Backup
```bash
# Create snapshot
kubectl exec -n caep postgres-0 -- \
  pg_dump -U caep -Fc caep > caep-backup-$(date +%Y%m%d-%H%M%S).dump

# Upload to S3
aws s3 cp caep-backup-*.dump s3://caep-backups/postgres/ --sse AES256
```

## Restore Procedures

### Restore from RDS Snapshot
```bash
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier caep-restored \
  --snapshot-identifier <snapshot-id> \
  --engine aurora-postgresql \
  --engine-version 15.4
```

### Restore from pg_dump
```bash
# Download backup
aws s3 cp s3://caep-backups/postgres/<backup-file>.dump .

# Restore
kubectl exec -i -n caep postgres-0 -- \
  pg_restore -U caep -d caep --clean --if-exists < <backup-file>.dump
```

### Point-in-Time Recovery (PITR)
```bash
aws rds restore-db-cluster-to-point-in-time \
  --db-cluster-identifier caep-pitr \
  --source-db-cluster-identifier caep-cluster \
  --restore-to-time 2024-01-15T14:30:00Z
```

## Recovery Time Objectives

| Scenario | RTO | RPO |
|---------|-----|-----|
| Pod failure | < 30 seconds (HPA replaces) | 0 |
| Single AZ failure | < 2 minutes (Aurora failover) | 0 |
| Full DB restore from snapshot | < 30 minutes | 24 hours |
| Full DB restore from PITR | < 30 minutes | 5 minutes |
| Complete region failure | < 4 hours (manual) | 24 hours |
