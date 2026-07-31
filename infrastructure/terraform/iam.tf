###############################################################################
# Finance Now Free — IAM Roles and Policies (Least-Privilege, IRSA)
###############################################################################

###############################################################################
# EKS Node Group IAM Role
###############################################################################

resource "aws_iam_role" "eks_node_group" {
  name = "${local.name_prefix}-eks-node-group-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-eks-node-group-role"
  })
}

resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  role       = aws_iam_role.eks_node_group.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  role       = aws_iam_role.eks_node_group.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_iam_role_policy_attachment" "ecr_readonly" {
  role       = aws_iam_role.eks_node_group.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.eks_node_group.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.eks_node_group.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

###############################################################################
# IRSA — Backend Service Account Role
# Grants backend pods least-privilege access to AWS services
###############################################################################

data "aws_iam_policy_document" "backend_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:sub"
      values   = ["system:serviceaccount:fn:fn-backend-sa"]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backend" {
  name               = "${local.name_prefix}-backend-role"
  assume_role_policy = data.aws_iam_policy_document.backend_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-backend-irsa-role"
  })
}

# Policy: Secrets Manager — read Finance Now Free secrets only
resource "aws_iam_policy" "backend_secrets" {
  name        = "${local.name_prefix}-backend-secrets-policy"
  description = "Allow backend to read Finance Now Free secrets from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadFnSecrets"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ]
        Resource = [
          aws_secretsmanager_secret.backend.arn,
          aws_secretsmanager_secret.api_keys.arn,
        ]
      },
      {
        Sid    = "DecryptSecrets"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey",
        ]
        Resource = [aws_kms_key.fn.arn]
      }
    ]
  })

  tags = local.common_tags
}

# Policy: S3 — access to Finance Now Free data buckets only
resource "aws_iam_policy" "backend_s3" {
  name        = "${local.name_prefix}-backend-s3-policy"
  description = "Allow backend to read/write Finance Now Free S3 data buckets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ListBuckets"
        Effect = "Allow"
        Action = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = [
          "arn:aws:s3:::${local.name_prefix}-data",
          "arn:aws:s3:::${local.name_prefix}-exports",
        ]
      },
      {
        Sid    = "ReadWriteObjects"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion",
        ]
        Resource = [
          "arn:aws:s3:::${local.name_prefix}-data/*",
          "arn:aws:s3:::${local.name_prefix}-exports/*",
        ]
      },
      {
        Sid      = "DecryptS3"
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource = [aws_kms_key.fn.arn]
      }
    ]
  })

  tags = local.common_tags
}

# Policy: CloudWatch — publish custom metrics
resource "aws_iam_policy" "backend_cloudwatch" {
  name        = "${local.name_prefix}-backend-cloudwatch-policy"
  description = "Allow backend to publish custom metrics to CloudWatch"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "PutMetrics"
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "Finance Now Free"
          }
        }
      },
      {
        Sid    = "CreateLogGroups"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:/fn/*:*"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "backend_secrets" {
  role       = aws_iam_role.backend.name
  policy_arn = aws_iam_policy.backend_secrets.arn
}

resource "aws_iam_role_policy_attachment" "backend_s3" {
  role       = aws_iam_role.backend.name
  policy_arn = aws_iam_policy.backend_s3.arn
}

resource "aws_iam_role_policy_attachment" "backend_cloudwatch" {
  role       = aws_iam_role.backend.name
  policy_arn = aws_iam_policy.backend_cloudwatch.arn
}

###############################################################################
# IRSA — VPC CNI Role
###############################################################################

data "aws_iam_policy_document" "vpc_cni_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:sub"
      values   = ["system:serviceaccount:kube-system:aws-node"]
    }
  }
}

resource "aws_iam_role" "vpc_cni" {
  name               = "${local.name_prefix}-vpc-cni-role"
  assume_role_policy = data.aws_iam_policy_document.vpc_cni_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc-cni-irsa-role"
  })
}

resource "aws_iam_role_policy_attachment" "vpc_cni" {
  role       = aws_iam_role.vpc_cni.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

###############################################################################
# IRSA — EBS CSI Driver Role
###############################################################################

data "aws_iam_policy_document" "ebs_csi_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:sub"
      values   = ["system:serviceaccount:kube-system:ebs-csi-controller-sa"]
    }
  }
}

resource "aws_iam_role" "ebs_csi" {
  name               = "${local.name_prefix}-ebs-csi-role"
  assume_role_policy = data.aws_iam_policy_document.ebs_csi_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-ebs-csi-irsa-role"
  })
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  role       = aws_iam_role.ebs_csi.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

# Additional policy for KMS-encrypted EBS volumes
resource "aws_iam_policy" "ebs_csi_kms" {
  name = "${local.name_prefix}-ebs-csi-kms-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "kms:CreateGrant",
        "kms:ListGrants",
        "kms:RevokeGrant",
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:DescribeKey",
      ]
      Resource = [aws_kms_key.fn.arn]
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ebs_csi_kms" {
  role       = aws_iam_role.ebs_csi.name
  policy_arn = aws_iam_policy.ebs_csi_kms.arn
}

###############################################################################
# IRSA — ALB Controller Role
###############################################################################

data "aws_iam_policy_document" "alb_controller_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:sub"
      values   = ["system:serviceaccount:kube-system:aws-load-balancer-controller"]
    }
  }
}

resource "aws_iam_role" "alb_controller" {
  name               = "${local.name_prefix}-alb-controller-role"
  assume_role_policy = data.aws_iam_policy_document.alb_controller_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alb-controller-irsa-role"
  })
}

# ALB controller requires a specific AWS-managed policy document
# See: https://github.com/kubernetes-sigs/aws-load-balancer-controller/blob/main/docs/install/iam_policy.json
resource "aws_iam_policy" "alb_controller" {
  name        = "${local.name_prefix}-alb-controller-policy"
  description = "Policy for AWS Load Balancer Controller"

  policy = file("${path.module}/policies/alb-controller-policy.json")

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "alb_controller" {
  role       = aws_iam_role.alb_controller.name
  policy_arn = aws_iam_policy.alb_controller.arn
}

###############################################################################
# IRSA — Cluster Autoscaler Role
###############################################################################

data "aws_iam_policy_document" "cluster_autoscaler_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:sub"
      values   = ["system:serviceaccount:kube-system:cluster-autoscaler"]
    }
  }
}

resource "aws_iam_role" "cluster_autoscaler" {
  name               = "${local.name_prefix}-cluster-autoscaler-role"
  assume_role_policy = data.aws_iam_policy_document.cluster_autoscaler_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-cluster-autoscaler-irsa-role"
  })
}

resource "aws_iam_policy" "cluster_autoscaler" {
  name        = "${local.name_prefix}-cluster-autoscaler-policy"
  description = "Policy for Cluster Autoscaler to manage EC2 Auto Scaling Groups"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DescribeAutoscaling"
        Effect = "Allow"
        Action = [
          "autoscaling:DescribeAutoScalingGroups",
          "autoscaling:DescribeAutoScalingInstances",
          "autoscaling:DescribeLaunchConfigurations",
          "autoscaling:DescribeScalingActivities",
          "autoscaling:DescribeTags",
          "ec2:DescribeImages",
          "ec2:DescribeInstanceTypes",
          "ec2:DescribeLaunchTemplateVersions",
          "ec2:GetInstanceTypesFromInstanceRequirements",
          "eks:DescribeNodegroup",
        ]
        Resource = "*"
      },
      {
        Sid    = "ModifyAutoscaling"
        Effect = "Allow"
        Action = [
          "autoscaling:SetDesiredCapacity",
          "autoscaling:TerminateInstanceInAutoScalingGroup",
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:ResourceTag/k8s.io/cluster-autoscaler/${local.name_prefix}-eks" = "owned"
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "cluster_autoscaler" {
  role       = aws_iam_role.cluster_autoscaler.name
  policy_arn = aws_iam_policy.cluster_autoscaler.arn
}

###############################################################################
# CI/CD Deploy Role — assumed by GitHub Actions
###############################################################################

resource "aws_iam_role" "cicd_deploy" {
  name = "${local.name_prefix}-cicd-deploy-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRoleWithWebIdentity"
      Principal = {
        Federated = "arn:aws:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
      }
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # Replace with your actual GitHub org/repo
          "token.actions.githubusercontent.com:sub" = "repo:your-org/finance-now:*"
        }
      }
    }]
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-cicd-deploy-role"
  })
}

resource "aws_iam_policy" "cicd_deploy" {
  name        = "${local.name_prefix}-cicd-deploy-policy"
  description = "Least-privilege policy for CI/CD to deploy Finance Now Free to EKS"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ECRAuthentication"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "ECRPushImages"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:DescribeImages",
          "ecr:DescribeRepositories",
        ]
        Resource = [
          aws_ecr_repository.backend.arn,
          aws_ecr_repository.frontend.arn,
        ]
      },
      {
        Sid    = "EKSDescribe"
        Effect = "Allow"
        Action = [
          "eks:DescribeCluster",
          "eks:ListClusters",
        ]
        Resource = "arn:aws:eks:${var.aws_region}:${local.account_id}:cluster/${local.name_prefix}-eks"
      },
      {
        Sid      = "STSForKubeconfig"
        Effect   = "Allow"
        Action   = ["sts:GetCallerIdentity"]
        Resource = "*"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "cicd_deploy" {
  role       = aws_iam_role.cicd_deploy.name
  policy_arn = aws_iam_policy.cicd_deploy.arn
}
