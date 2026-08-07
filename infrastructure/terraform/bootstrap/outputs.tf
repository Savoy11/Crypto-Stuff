###############################################################################
# Finance Now — Bootstrap Outputs
#
# These are the values the root module's backend block expects. If an apply here
# produces anything different from what ../main.tf hardcodes, the root init will
# fail — compare them before moving on.
###############################################################################

output "state_bucket" {
  description = "S3 bucket holding remote state (root backend: bucket)"
  value       = aws_s3_bucket.state.id
}

output "lock_table" {
  description = "DynamoDB table used for state locking (root backend: dynamodb_table)"
  value       = aws_dynamodb_table.locks.name
}

output "kms_key_alias" {
  description = "KMS alias encrypting state (root backend: kms_key_id)"
  value       = aws_kms_alias.state.name
}

output "kms_key_arn" {
  description = "ARN of the state encryption key"
  value       = aws_kms_key.state.arn
}

output "next_step" {
  description = "The per-environment init commands to run once this has applied"
  value       = <<-EOT
    Bootstrap complete. Initialise each environment against its own state key:

      cd ..
      terraform init -reconfigure -backend-config="key=staging/terraform.tfstate"
      terraform apply -var="environment=staging"

      terraform init -reconfigure -backend-config="key=production/terraform.tfstate"
      terraform apply -var="environment=production" -var="manage_github_oidc_provider=false"

    The second environment sets manage_github_oidc_provider=false because an AWS
    account can hold only one GitHub OIDC provider.
  EOT
}
