###############################################################################
# Finance Now Free — Terraform Outputs
###############################################################################

###############################################################################
# VPC
###############################################################################

output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = module.vpc.public_subnets
}

output "database_subnet_ids" {
  description = "IDs of database subnets"
  value       = module.vpc.database_subnets
}

output "database_subnet_group_name" {
  description = "Name of the database subnet group"
  value       = module.vpc.database_subnet_group_name
}

###############################################################################
# EKS
###############################################################################

output "eks_cluster_name" {
  description = "Name of the EKS cluster"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "API endpoint for the EKS cluster"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "eks_cluster_certificate_authority_data" {
  description = "Base64-encoded CA certificate for the EKS cluster"
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "eks_cluster_version" {
  description = "Kubernetes version of the EKS cluster"
  value       = module.eks.cluster_version
}

output "eks_node_group_arn" {
  description = "ARN of the EKS managed node group"
  value       = module.eks.eks_managed_node_groups["fn_nodes"].node_group_arn
}

output "eks_oidc_provider_arn" {
  description = "ARN of the OIDC provider for IRSA"
  value       = module.eks.oidc_provider_arn
}

output "eks_kubeconfig_command" {
  description = "AWS CLI command to update kubeconfig for the cluster"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

###############################################################################
# RDS Aurora PostgreSQL
###############################################################################

output "rds_cluster_endpoint" {
  description = "Writer endpoint for the Aurora cluster"
  value       = aws_rds_cluster.fn.endpoint
  sensitive   = true
}

output "rds_cluster_reader_endpoint" {
  description = "Reader endpoint for the Aurora cluster (load balanced across readers)"
  value       = aws_rds_cluster.fn.reader_endpoint
  sensitive   = true
}

output "rds_cluster_id" {
  description = "ID of the Aurora DB cluster"
  value       = aws_rds_cluster.fn.cluster_identifier
}

output "rds_cluster_port" {
  description = "Port of the Aurora cluster"
  value       = aws_rds_cluster.fn.port
}

output "rds_cluster_database_name" {
  description = "Name of the default database"
  value       = aws_rds_cluster.fn.database_name
}

output "rds_security_group_id" {
  description = "Security group ID for RDS access"
  value       = aws_security_group.rds.id
}

###############################################################################
# ElastiCache Redis
###############################################################################

output "redis_primary_endpoint" {
  description = "Primary endpoint of the Redis replication group"
  value       = aws_elasticache_replication_group.fn.primary_endpoint_address
  sensitive   = true
}

output "redis_reader_endpoint" {
  description = "Reader endpoint of the Redis replication group"
  value       = aws_elasticache_replication_group.fn.reader_endpoint_address
  sensitive   = true
}

output "redis_port" {
  description = "Port for the Redis cluster"
  value       = aws_elasticache_replication_group.fn.port
}

output "redis_security_group_id" {
  description = "Security group ID for Redis access"
  value       = aws_security_group.redis.id
}

###############################################################################
# ECR
###############################################################################

output "ecr_backend_repository_url" {
  description = "URL of the ECR repository for the backend image"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_repository_url" {
  description = "URL of the ECR repository for the frontend image"
  value       = aws_ecr_repository.frontend.repository_url
}

###############################################################################
# IAM
###############################################################################

output "backend_iam_role_arn" {
  description = "ARN of the IAM role for the backend service account (IRSA)"
  value       = aws_iam_role.backend.arn
}

output "node_group_iam_role_arn" {
  description = "ARN of the IAM role for EKS node group instances"
  value       = aws_iam_role.eks_node_group.arn
}

###############################################################################
# Security
###############################################################################

output "kms_key_arn" {
  description = "ARN of the Finance Now Free master KMS key"
  value       = aws_kms_key.fn.arn
}

output "kms_key_id" {
  description = "ID of the Finance Now Free master KMS key"
  value       = aws_kms_key.fn.key_id
}

output "waf_web_acl_arn" {
  description = "ARN of the WAF Web ACL for the ALB"
  value       = aws_wafv2_web_acl.fn.arn
}

###############################################################################
# Secrets Manager
###############################################################################

output "backend_secrets_arn" {
  description = "ARN of the Secrets Manager secret for backend configuration"
  value       = aws_secretsmanager_secret.backend.arn
}

output "api_keys_secrets_arn" {
  description = "ARN of the Secrets Manager secret for external API keys"
  value       = aws_secretsmanager_secret.api_keys.arn
}

###############################################################################
# Useful connection strings (without passwords)
###############################################################################

output "database_url_template" {
  description = "Template DATABASE_URL — replace PASSWORD with secret value"
  value       = "postgresql+asyncpg://caep:PASSWORD@${aws_rds_cluster.fn.endpoint}:5432/caep"
  sensitive   = true
}

output "redis_url_template" {
  description = "Template REDIS_URL — replace PASSWORD with secret value"
  value       = "redis://:PASSWORD@${aws_elasticache_replication_group.fn.primary_endpoint_address}:6379/0"
  sensitive   = true
}
