###############################################################################
# Finance Now Free — Crypto Asset Evaluation Platform
# Terraform Root Module
# AWS Provider + EKS Cluster Infrastructure
###############################################################################

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.30"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Remote state in S3 with DynamoDB locking
  backend "s3" {
    bucket         = "fn-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "alias/fn-terraform-state"
    dynamodb_table = "fn-terraform-locks"
  }
}

###############################################################################
# Providers
###############################################################################

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "fn"
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = "platform-team"
      CostCenter  = "fn-infrastructure"
    }
  }
}

# Secondary provider for us-east-1 (required for ACM + CloudFront certs)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "fn"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

###############################################################################
# Data Sources
###############################################################################

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

###############################################################################
# Local Values
###############################################################################

locals {
  account_id = data.aws_caller_identity.current.account_id
  azs        = slice(data.aws_availability_zones.available.names, 0, 3)

  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Region      = var.aws_region
  }
}

###############################################################################
# KMS Key for encryption at rest
###############################################################################

resource "aws_kms_key" "fn" {
  description             = "Finance Now Free ${var.environment} — master encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region            = false

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${local.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      }
      # No per-role statement here. Referencing aws_iam_role.backend.arn in
      # this policy created a dependency cycle (eks → this key → backend role
      # → eks OIDC). The root statement above delegates access control to IAM
      # identity policies, and the backend role already gets kms:Decrypt/
      # GenerateDataKey via its DecryptSecrets policy in iam.tf.
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-kms-key"
  })
}

resource "aws_kms_alias" "fn" {
  name          = "alias/${local.name_prefix}"
  target_key_id = aws_kms_key.fn.key_id
}

###############################################################################
# ECR Repositories
###############################################################################

resource "aws_ecr_repository" "backend" {
  name                 = "${local.name_prefix}/backend"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.fn.arn
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-ecr-backend"
  })
}

resource "aws_ecr_repository" "frontend" {
  name                 = "${local.name_prefix}/frontend"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.fn.arn
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-ecr-frontend"
  })
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 20 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 20
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  repository = aws_ecr_repository.frontend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 20 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 20
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      }
    ]
  })
}

###############################################################################
# Secrets Manager — Application Secrets
###############################################################################

resource "aws_secretsmanager_secret" "backend" {
  name                    = "fn/${var.environment}/backend"
  description             = "Finance Now Free backend application secrets"
  kms_key_id              = aws_kms_key.fn.arn
  recovery_window_in_days = 30

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-backend-secrets"
  })
}

resource "aws_secretsmanager_secret" "api_keys" {
  name                    = "fn/${var.environment}/api-keys"
  description             = "Finance Now Free external API keys (CoinGecko, DefiLlama, Chainlink)"
  kms_key_id              = aws_kms_key.fn.arn
  recovery_window_in_days = 30

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api-keys"
  })
}

###############################################################################
# WAF Web ACL for ALB
###############################################################################

resource "aws_wafv2_web_acl" "fn" {
  name        = "${local.name_prefix}-waf"
  description = "Finance Now Free WAF rules for ALB"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # AWS Managed Rules
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesKnownBadInputsRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  # Rate limiting: 2000 req per 5 minutes per IP
  rule {
    name     = "RateLimitRule"
    priority = 10
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRuleMetric"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-waf"
    sampled_requests_enabled   = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-waf"
  })
}
