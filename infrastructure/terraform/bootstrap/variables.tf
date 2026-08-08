###############################################################################
# Finance Now — Bootstrap Variables
#
# These must agree with the root module's backend block in ../main.tf, which
# hardcodes the bucket, table and KMS alias (a backend block cannot take
# variables). Changing project_name here means changing that block too.
###############################################################################

variable "project_name" {
  description = "Short project identifier; prefixes the state bucket, lock table and KMS alias"
  type        = string
  default     = "fn"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,15}$", var.project_name))
    error_message = "project_name must be 3–16 lowercase alphanumeric characters or hyphens, starting with a letter."
  }
}

variable "aws_region" {
  description = "Region holding the state bucket and lock table. Must match the root backend block."
  type        = string
  default     = "us-east-1"
}
