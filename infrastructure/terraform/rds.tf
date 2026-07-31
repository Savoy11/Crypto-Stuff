###############################################################################
# Finance Now Free — Aurora PostgreSQL 15 (Multi-AZ, encrypted, automated backups)
###############################################################################

###############################################################################
# DB Cluster Parameter Group
###############################################################################

resource "aws_rds_cluster_parameter_group" "fn" {
  name        = "${local.name_prefix}-aurora-pg15"
  family      = "aurora-postgresql15"
  description = "Finance Now Free Aurora PostgreSQL 15 cluster parameter group"

  # TimescaleDB extension support
  parameter {
    name         = "shared_preload_libraries"
    value        = "timescaledb,pg_stat_statements,auto_explain"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }

  parameter {
    name  = "log_checkpoints"
    value = "1"
  }

  parameter {
    name  = "log_lock_waits"
    value = "1"
  }

  parameter {
    name  = "log_temp_files"
    value = "0"
  }

  parameter {
    name  = "log_autovacuum_min_duration"
    value = "0"
  }

  parameter {
    name  = "autovacuum_max_workers"
    value = "4"
  }

  parameter {
    name  = "autovacuum_naptime"
    value = "10"
  }

  parameter {
    name  = "max_connections"
    value = "500"
  }

  parameter {
    name  = "work_mem"
    value = "16384" # 16MB in KB
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "262144" # 256MB in KB
  }

  parameter {
    name         = "track_io_timing"
    value        = "1"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "pg_stat_statements.track"
    value = "all"
  }

  parameter {
    name  = "auto_explain.log_min_duration"
    value = "1000"
  }

  parameter {
    name  = "auto_explain.log_analyze"
    value = "1"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-aurora-pg15-params"
  })
}

resource "aws_db_parameter_group" "fn" {
  name        = "${local.name_prefix}-aurora-pg15-instance"
  family      = "aurora-postgresql15"
  description = "Finance Now Free Aurora PostgreSQL 15 instance parameter group"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-aurora-pg15-instance-params"
  })
}

###############################################################################
# RDS Enhanced Monitoring Role
###############################################################################

resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name_prefix}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "monitoring.rds.amazonaws.com"
      }
    }]
  })

  managed_policy_arns = [
    "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
  ]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-rds-monitoring-role"
  })
}

###############################################################################
# Aurora Cluster
###############################################################################

resource "random_password" "rds_master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret_version" "rds_password" {
  secret_id = aws_secretsmanager_secret.backend.id
  secret_string = jsonencode({
    db_password = random_password.rds_master.result
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_rds_cluster" "fn" {
  cluster_identifier          = "${local.name_prefix}-aurora"
  engine                      = "aurora-postgresql"
  engine_version              = var.rds_engine_version
  engine_mode                 = "provisioned"
  database_name               = "caep"
  master_username             = "caep"
  master_password             = random_password.rds_master.result
  manage_master_user_password = false

  # Networking
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]
  availability_zones     = local.azs
  port                   = 5432

  # Storage encryption
  storage_encrypted = true
  kms_key_id        = aws_kms_key.fn.arn

  # Backups
  backup_retention_period      = var.rds_backup_retention_days
  preferred_backup_window      = "03:00-04:00"
  preferred_maintenance_window = "mon:04:00-mon:05:00"
  copy_tags_to_snapshot        = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${local.name_prefix}-final-${formatdate("YYYY-MM-DD", timestamp())}"
  deletion_protection          = var.rds_deletion_protection

  # Logs
  enabled_cloudwatch_logs_exports = ["postgresql"]

  # Parameter group
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.fn.name

  # Serverless v2 scaling (optional — use for variable load patterns)
  # serverlessv2_scaling_configuration {
  #   min_capacity = 0.5
  #   max_capacity = 16
  # }

  apply_immediately = false

  lifecycle {
    ignore_changes = [
      master_password,
      availability_zones,
      final_snapshot_identifier,
    ]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-aurora-cluster"
  })
}

###############################################################################
# Aurora Cluster Instances
###############################################################################

resource "aws_rds_cluster_instance" "fn" {
  count = var.rds_instance_count

  identifier         = "${local.name_prefix}-aurora-${count.index}"
  cluster_identifier = aws_rds_cluster.fn.id
  instance_class     = var.rds_instance_class
  engine             = aws_rds_cluster.fn.engine
  engine_version     = aws_rds_cluster.fn.engine_version

  # First instance is the writer; subsequent are readers
  promotion_tier = count.index == 0 ? 0 : 1

  db_parameter_group_name = aws_db_parameter_group.fn.name
  db_subnet_group_name    = module.vpc.database_subnet_group_name

  # Monitoring
  monitoring_interval                   = 15 # Enhanced monitoring every 15 seconds
  monitoring_role_arn                   = aws_iam_role.rds_monitoring.arn
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.fn.arn
  performance_insights_retention_period = 7

  # Auto minor version upgrade
  auto_minor_version_upgrade = true
  apply_immediately          = false
  publicly_accessible        = false

  copy_tags_to_snapshot = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-aurora-instance-${count.index}"
    Role = count.index == 0 ? "writer" : "reader"
  })
}

###############################################################################
# RDS CloudWatch Alarms
###############################################################################

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name_prefix}-rds-cpu-high"
  alarm_description   = "RDS Aurora CPU utilization exceeded 80%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.fn.cluster_identifier
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${local.name_prefix}-rds-connections-high"
  alarm_description   = "RDS Aurora database connections exceeded 400"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 400
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.fn.cluster_identifier
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "rds_freeable_memory" {
  alarm_name          = "${local.name_prefix}-rds-memory-low"
  alarm_description   = "RDS Aurora freeable memory below 512MB"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 536870912 # 512MB in bytes
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.fn.cluster_identifier
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

###############################################################################
# SNS Topic for Alerts
###############################################################################

resource "aws_sns_topic" "alerts" {
  name              = "${local.name_prefix}-alerts"
  kms_master_key_id = aws_kms_key.fn.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alerts-topic"
  })
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
