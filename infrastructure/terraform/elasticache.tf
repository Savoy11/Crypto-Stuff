###############################################################################
# CAEP — ElastiCache Redis 7 (Replication Group, Multi-AZ, encrypted)
###############################################################################

###############################################################################
# Parameter Group
###############################################################################

resource "aws_elasticache_parameter_group" "caep" {
  name        = "${local.name_prefix}-redis7"
  family      = "redis7"
  description = "CAEP Redis 7 parameter group"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "activerehashing"
    value = "yes"
  }

  parameter {
    name  = "lazyfree-lazy-eviction"
    value = "yes"
  }

  parameter {
    name  = "lazyfree-lazy-expire"
    value = "yes"
  }

  parameter {
    name  = "lazyfree-lazy-server-del"
    value = "yes"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  parameter {
    name  = "hz"
    value = "15"
  }

  parameter {
    name  = "appendonly"
    value = "yes"
  }

  parameter {
    name  = "appendfsync"
    value = "everysec"
  }

  parameter {
    name  = "no-appendfsync-on-rewrite"
    value = "yes"
  }

  parameter {
    name  = "auto-aof-rewrite-percentage"
    value = "100"
  }

  parameter {
    name  = "auto-aof-rewrite-min-size"
    value = "64mb"
  }

  parameter {
    name  = "slowlog-log-slower-than"
    value = "10000"
  }

  parameter {
    name  = "slowlog-max-len"
    value = "128"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis7-params"
  })
}

###############################################################################
# Subnet Group
###############################################################################

resource "aws_elasticache_subnet_group" "caep" {
  name        = "${local.name_prefix}-redis-subnet-group"
  description = "CAEP ElastiCache Redis subnet group"
  subnet_ids  = module.vpc.database_subnets

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-subnet-group"
  })
}

###############################################################################
# Auth Token (stored in Secrets Manager)
###############################################################################

resource "random_password" "redis_auth" {
  length           = 32
  special          = false  # Redis auth tokens cannot contain special chars
}

###############################################################################
# Replication Group
###############################################################################

resource "aws_elasticache_replication_group" "caep" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "CAEP Redis replication group — cache, sessions, pub/sub"

  # Engine
  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.caep.name

  # Multi-AZ and clustering
  num_cache_clusters         = var.redis_num_cache_clusters
  automatic_failover_enabled = var.redis_automatic_failover
  multi_az_enabled           = var.redis_num_cache_clusters > 1

  # Subnet group and security
  subnet_group_name  = aws_elasticache_subnet_group.caep.name
  security_group_ids = [aws_security_group.redis.id]

  # Encryption
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  kms_key_id                  = aws_kms_key.caep.arn
  auth_token                  = random_password.redis_auth.result

  # Backups
  snapshot_retention_limit = 7
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "mon:06:00-mon:07:00"

  # Notifications
  notification_topic_arn = aws_sns_topic.alerts.arn

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_engine.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }

  apply_immediately = false

  lifecycle {
    ignore_changes = [auth_token]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-replication-group"
  })
}

###############################################################################
# CloudWatch Log Groups for Redis
###############################################################################

resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/${local.name_prefix}/redis/slow-log"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.caep.arn

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "redis_engine" {
  name              = "/aws/elasticache/${local.name_prefix}/redis/engine-log"
  retention_in_days = 14
  kms_key_id        = aws_kms_key.caep.arn

  tags = local.common_tags
}

###############################################################################
# CloudWatch Alarms
###############################################################################

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${local.name_prefix}-redis-memory-high"
  alarm_description   = "Redis memory usage exceeded 80% of available"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.caep.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "redis_connections" {
  alarm_name          = "${local.name_prefix}-redis-connections-high"
  alarm_description   = "Redis concurrent connections exceeded 8000"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CurrConnections"
  namespace           = "AWS/ElastiCache"
  period              = 60
  statistic           = "Average"
  threshold           = 8000
  treat_missing_data  = "notBreaching"

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.caep.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${local.name_prefix}-redis-cpu-high"
  alarm_description   = "Redis engine CPU utilization exceeded 75%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "EngineCPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 60
  statistic           = "Average"
  threshold           = 75
  treat_missing_data  = "notBreaching"

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.caep.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "redis_replication_lag" {
  alarm_name          = "${local.name_prefix}-redis-replication-lag"
  alarm_description   = "Redis replication lag exceeded 30 seconds"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ReplicationLag"
  namespace           = "AWS/ElastiCache"
  period              = 60
  statistic           = "Maximum"
  threshold           = 30
  treat_missing_data  = "notBreaching"

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.caep.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

###############################################################################
# Store Redis auth token in Secrets Manager
###############################################################################

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id = aws_secretsmanager_secret.backend.id
  secret_string = jsonencode({
    redis_auth_token = random_password.redis_auth.result
    redis_url        = "rediss://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.caep.primary_endpoint_address}:6379/0"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }

  depends_on = [aws_secretsmanager_secret_version.rds_password]
}
