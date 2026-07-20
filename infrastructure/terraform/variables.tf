###############################################################################
# CAEP — Terraform Variables
###############################################################################

variable "project_name" {
  description = "Short project identifier used in all resource names and tags"
  type        = string
  default     = "caep"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,15}$", var.project_name))
    error_message = "project_name must be 3–16 lowercase alphanumeric characters or hyphens, starting with a letter."
  }
}

variable "environment" {
  description = "Deployment environment (staging | production)"
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be one of: staging, production."
  }
}

variable "aws_region" {
  description = "Primary AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

###############################################################################
# VPC
###############################################################################

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr))
    error_message = "vpc_cidr must be a valid CIDR block."
  }
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (one per AZ, minimum 3)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]

  validation {
    condition     = length(var.private_subnet_cidrs) >= 3
    error_message = "At least 3 private subnet CIDRs are required for multi-AZ HA."
  }
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ, minimum 3)"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) >= 3
    error_message = "At least 3 public subnet CIDRs are required for multi-AZ HA."
  }
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for isolated database subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]
}

variable "enable_nat_gateway" {
  description = "Whether to provision NAT gateways for private subnet internet access"
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Use a single NAT gateway instead of one per AZ (cost optimization for staging)"
  type        = bool
  default     = false
}

###############################################################################
# EKS
###############################################################################

variable "eks_cluster_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.29"
}

variable "eks_node_instance_types" {
  description = "EC2 instance types for EKS managed node group"
  type        = list(string)
  default     = ["m6i.large", "m6a.large"]

  validation {
    condition     = length(var.eks_node_instance_types) > 0
    error_message = "At least one instance type must be specified."
  }
}

variable "eks_node_min_size" {
  description = "Minimum number of nodes in the EKS managed node group"
  type        = number
  default     = 3

  validation {
    condition     = var.eks_node_min_size >= 1
    error_message = "Minimum node count must be at least 1."
  }
}

variable "eks_node_max_size" {
  description = "Maximum number of nodes in the EKS managed node group"
  type        = number
  default     = 10

  validation {
    condition     = var.eks_node_max_size >= var.eks_node_min_size
    error_message = "Maximum node count must be >= minimum node count."
  }
}

variable "eks_node_desired_size" {
  description = "Desired number of nodes at cluster creation"
  type        = number
  default     = 3
}

variable "eks_node_disk_size" {
  description = "Root EBS volume size (GiB) for EKS nodes"
  type        = number
  default     = 100
}

variable "eks_public_access_cidrs" {
  description = "CIDRs allowed to reach the EKS public API endpoint"
  type        = list(string)
  default     = ["0.0.0.0/0"] # Restrict in production to corporate IP ranges
}

###############################################################################
# RDS Aurora PostgreSQL
###############################################################################

variable "rds_instance_class" {
  description = "Aurora instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "rds_engine_version" {
  description = "Aurora PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

variable "rds_backup_retention_days" {
  description = "Number of days to retain automated RDS backups"
  type        = number
  default     = 7

  validation {
    condition     = var.rds_backup_retention_days >= 1 && var.rds_backup_retention_days <= 35
    error_message = "Backup retention must be between 1 and 35 days."
  }
}

variable "rds_deletion_protection" {
  description = "Enable deletion protection on the RDS cluster (disable only for destroy)"
  type        = bool
  default     = true
}

variable "rds_instance_count" {
  description = "Number of Aurora instances (writer + readers)"
  type        = number
  default     = 2

  validation {
    condition     = var.rds_instance_count >= 1
    error_message = "At least 1 RDS instance required."
  }
}

###############################################################################
# ElastiCache Redis
###############################################################################

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r6g.large"
}

variable "redis_engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.1"
}

variable "redis_num_cache_clusters" {
  description = "Number of cache clusters in the replication group"
  type        = number
  default     = 3

  validation {
    condition     = var.redis_num_cache_clusters >= 1
    error_message = "At least 1 cache cluster required."
  }
}

variable "redis_automatic_failover" {
  description = "Enable automatic failover for Redis replication group"
  type        = bool
  default     = true
}

###############################################################################
# DNS / ACM
###############################################################################

variable "domain_name" {
  description = "Primary domain for the CAEP platform (e.g., caep.example.com)"
  type        = string
  default     = "caep.example.com"
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for the domain"
  type        = string
  default     = ""
}

###############################################################################
# Monitoring / Alerting
###############################################################################

variable "slack_webhook_url" {
  description = "Slack webhook URL for alerting (stored in Secrets Manager)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "pagerduty_integration_key" {
  description = "PagerDuty integration key for critical alerts"
  type        = string
  default     = ""
  sensitive   = true
}

variable "alert_email" {
  description = "Email address for CloudWatch alarm notifications"
  type        = string
  default     = "platform-alerts@example.com"
}
