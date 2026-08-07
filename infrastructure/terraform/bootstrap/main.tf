###############################################################################
# Finance Now — Terraform State Bootstrap
#
# The root module keeps its state in S3 with DynamoDB locking, which means the
# bucket, the lock table and the KMS key must already exist before its very first
# `terraform init`. Nothing created them, so the root module could never be
# initialised from a clean account.
#
# This module creates exactly those three things and nothing else. It keeps its
# own state LOCALLY and on purpose: a module whose job is to create the remote
# backend cannot itself live in that backend.
#
# Run once per AWS account, before anything else:
#
#   cd infrastructure/terraform/bootstrap
#   terraform init
#   terraform apply
#
# Commit the resulting terraform.tfstate? No — it is gitignored. It records only
# these three resources, all of which are trivially re-importable, and the far
# worse outcome is committing state to a public repository. If it is lost, run
# `terraform import` for each of the three, or leave them alone: they are stable
# and rarely change.
###############################################################################

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.30"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
      Component = "tf-state-bootstrap"
    }
  }
}

locals {
  bucket_name = "${var.project_name}-terraform-state"
  table_name  = "${var.project_name}-terraform-locks"
  kms_alias   = "alias/${var.project_name}-terraform-state"
}

###############################################################################
# KMS key for state encryption
###############################################################################

resource "aws_kms_key" "state" {
  description             = "Encrypts Finance Now Terraform remote state"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_alias" "state" {
  name          = local.kms_alias
  target_key_id = aws_kms_key.state.key_id
}

###############################################################################
# State bucket
###############################################################################

resource "aws_s3_bucket" "state" {
  bucket = local.bucket_name

  # State describes the whole platform. Losing it is worse than any cleanup this
  # would ever save, so deletion has to be a deliberate console action.
  lifecycle {
    prevent_destroy = true
  }
}

# Versioning is the recovery path for a corrupted or truncated state push.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# State files contain resource attributes and occasionally secrets. Refuse any
# request that is not encrypted in transit.
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource = [
        aws_s3_bucket.state.arn,
        "${aws_s3_bucket.state.arn}/*",
      ]
      Condition = {
        Bool = {
          "aws:SecureTransport" = "false"
        }
      }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.state]
}

# Old state versions accumulate on every apply; keep enough to recover, not forever.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-noncurrent-state"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.state]
}

###############################################################################
# Lock table
###############################################################################

resource "aws_dynamodb_table" "locks" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"

  # Terraform requires this exact attribute name for S3 backend locking.
  hash_key = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.state.arn
  }

  point_in_time_recovery {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}
