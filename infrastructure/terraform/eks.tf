###############################################################################
# Finance Now — EKS Cluster + Managed Node Groups
###############################################################################

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.21"

  cluster_name    = "${local.name_prefix}-eks"
  cluster_version = var.eks_cluster_version

  # Networking
  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  # API endpoint access
  cluster_endpoint_public_access       = true
  cluster_endpoint_private_access      = true
  cluster_endpoint_public_access_cidrs = var.eks_public_access_cidrs

  # Cluster encryption with KMS
  cluster_encryption_config = {
    resources        = ["secrets"]
    provider_key_arn = aws_kms_key.fn.arn
  }

  # Security groups
  cluster_security_group_id = aws_security_group.eks_cluster.id
  node_security_group_id    = aws_security_group.eks_nodes.id

  # Cluster addons — managed by AWS for automatic security patches
  cluster_addons = {
    coredns = {
      most_recent = true
      configuration_values = jsonencode({
        replicaCount = 2
        resources = {
          limits   = { cpu = "0.25", memory = "256Mi" }
          requests = { cpu = "0.1", memory = "70Mi" }
        }
      })
    }

    kube-proxy = {
      most_recent = true
    }

    vpc-cni = {
      most_recent              = true
      service_account_role_arn = aws_iam_role.vpc_cni.arn
      configuration_values = jsonencode({
        env = {
          ENABLE_PREFIX_DELEGATION = "true"
          WARM_PREFIX_TARGET       = "1"
        }
      })
    }

    aws-ebs-csi-driver = {
      most_recent              = true
      service_account_role_arn = aws_iam_role.ebs_csi.arn
    }
  }

  # Cluster logging
  cluster_enabled_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler",
  ]

  create_cloudwatch_log_group            = true
  cloudwatch_log_group_retention_in_days = 30

  # aws-auth configmap
  manage_aws_auth_configmap = true

  aws_auth_roles = [
    {
      rolearn  = aws_iam_role.eks_node_group.arn
      username = "system:node:{{EC2PrivateDNSName}}"
      groups   = ["system:bootstrappers", "system:nodes"]
    },
    # CI/CD deploy role. Must reference the role Terraform actually creates —
    # a hardcoded name here silently maps a role that does not exist, and the
    # deploy then fails at kubectl time with an opaque authorization error.
    {
      rolearn  = aws_iam_role.cicd_deploy.arn
      username = "fn-cicd"
      groups   = ["fn-deployers"]
    },
  ]

  aws_auth_users = []

  ###############################################################################
  # Managed Node Groups
  ###############################################################################

  eks_managed_node_groups = {
    # General workload nodes
    fn_nodes = {
      name           = "${local.name_prefix}-nodes"
      ami_type       = "AL2_x86_64"
      instance_types = var.eks_node_instance_types
      capacity_type  = "ON_DEMAND"

      min_size     = var.eks_node_min_size
      max_size     = var.eks_node_max_size
      desired_size = var.eks_node_desired_size

      disk_size = var.eks_node_disk_size

      subnet_ids = module.vpc.private_subnets

      # Launch template configuration
      create_launch_template = true
      launch_template_tags = merge(local.common_tags, {
        Name = "${local.name_prefix}-node-lt"
      })

      # User data for additional node configuration
      pre_bootstrap_user_data = <<-EOT
        #!/bin/bash
        # Increase file descriptor limits
        echo "fs.file-max = 1048576" >> /etc/sysctl.conf
        echo "net.core.somaxconn = 65535" >> /etc/sysctl.conf
        echo "net.ipv4.tcp_max_syn_backlog = 65535" >> /etc/sysctl.conf
        sysctl -p

        # Install SSM Agent (for remote access without bastion)
        yum install -y amazon-ssm-agent
        systemctl enable amazon-ssm-agent
        systemctl start amazon-ssm-agent
      EOT

      # Node labels
      labels = {
        "node.kubernetes.io/lifecycle" = "normal"
        "fn/node-pool"                 = "general"
        "fn/environment"               = var.environment
      }

      # Taints — none for general pool
      taints = {}

      # Block device mappings (gp3 for performance + cost)
      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = var.eks_node_disk_size
            volume_type           = "gp3"
            iops                  = 3000
            throughput            = 125
            encrypted             = true
            kms_key_id            = aws_kms_key.fn.arn
            delete_on_termination = true
          }
        }
      }

      # Metadata options — enforce IMDSv2 for security
      metadata_options = {
        http_endpoint               = "enabled"
        http_tokens                 = "required" # IMDSv2 only
        http_put_response_hop_limit = 2
        instance_metadata_tags      = "disabled"
      }

      iam_role_additional_policies = {
        AmazonSSMManagedInstanceCore = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
        CloudWatchAgentServerPolicy  = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
      }

      update_config = {
        max_unavailable_percentage = 33
      }

      tags = merge(local.common_tags, {
        Name                                                 = "${local.name_prefix}-node"
        "k8s.io/cluster-autoscaler/${local.name_prefix}-eks" = "owned"
        "k8s.io/cluster-autoscaler/enabled"                  = "true"
      })
    }

    # Spot nodes for non-critical batch workloads (Celery workers)
    fn_spot_nodes = {
      name           = "${local.name_prefix}-spot-nodes"
      ami_type       = "AL2_x86_64"
      instance_types = ["m6i.large", "m6a.large", "m5.large", "m5a.large"]
      capacity_type  = "SPOT"

      min_size     = 0
      max_size     = 10
      desired_size = 2

      disk_size  = 50
      subnet_ids = module.vpc.private_subnets

      labels = {
        "node.kubernetes.io/lifecycle" = "spot"
        "fn/node-pool"                 = "spot"
        "fn/workload-type"             = "batch"
      }

      taints = {
        spot = {
          key    = "fn/spot"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      }

      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = 50
            volume_type           = "gp3"
            encrypted             = true
            kms_key_id            = aws_kms_key.fn.arn
            delete_on_termination = true
          }
        }
      }

      metadata_options = {
        http_endpoint               = "enabled"
        http_tokens                 = "required"
        http_put_response_hop_limit = 2
        instance_metadata_tags      = "disabled"
      }

      tags = merge(local.common_tags, {
        Name = "${local.name_prefix}-spot-node"
      })
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-eks"
  })
}

###############################################################################
# EKS Add-on: AWS Load Balancer Controller
###############################################################################

resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.6.2"

  set {
    name  = "clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "serviceAccount.create"
    value = "true"
  }

  set {
    name  = "serviceAccount.name"
    value = "aws-load-balancer-controller"
  }

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.alb_controller.arn
  }

  set {
    name  = "region"
    value = var.aws_region
  }

  set {
    name  = "vpcId"
    value = module.vpc.vpc_id
  }

  set {
    name  = "replicaCount"
    value = "2"
  }

  depends_on = [module.eks]
}

###############################################################################
# EKS Add-on: Cluster Autoscaler
###############################################################################

resource "helm_release" "cluster_autoscaler" {
  name       = "cluster-autoscaler"
  repository = "https://kubernetes.github.io/autoscaler"
  chart      = "cluster-autoscaler"
  namespace  = "kube-system"
  version    = "9.35.0"

  set {
    name  = "autoDiscovery.clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "awsRegion"
    value = var.aws_region
  }

  set {
    name  = "rbac.serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.cluster_autoscaler.arn
  }

  set {
    name  = "extraArgs.skip-nodes-with-local-storage"
    value = "false"
  }

  set {
    name  = "extraArgs.balance-similar-node-groups"
    value = "true"
  }

  set {
    name  = "extraArgs.expander"
    value = "least-waste"
  }

  depends_on = [module.eks]
}

###############################################################################
# EKS Add-on: Metrics Server (required for HPA)
###############################################################################

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  namespace  = "kube-system"
  version    = "3.12.0"

  set {
    name  = "args[0]"
    value = "--kubelet-insecure-tls"
  }

  set {
    name  = "replicas"
    value = "2"
  }

  depends_on = [module.eks]
}

###############################################################################
# RBAC for the CI/CD deploy role
#
# aws_auth_roles above maps the deploy role to the "fn-deployers" group, but a
# group with no binding grants nothing: the role authenticates to the cluster and
# then fails every kubectl apply with a bare "cannot ... at the cluster scope".
# These two resources are what make that mapping mean something.
#
# It must be created by Terraform rather than applied by the pipeline, because
# the pipeline would need this permission to apply it.
#
# Secrets are deliberately absent — they are managed by the External Secrets
# Operator, and the deploy workflow says so where it applies the base manifests.
###############################################################################

resource "kubernetes_cluster_role" "fn_deployers" {
  metadata {
    name = "fn-deployers"
  }

  # Namespace is cluster-scoped and the workflow applies namespace.yaml.
  rule {
    api_groups = [""]
    resources  = ["namespaces"]
    verbs      = ["get", "list", "watch", "create", "patch", "update"]
  }

  rule {
    api_groups = [""]
    resources  = ["configmaps", "services", "persistentvolumeclaims"]
    verbs      = ["get", "list", "watch", "create", "patch", "update"]
  }

  # Pods are read-only: needed for rollout status and smoke tests, never written.
  rule {
    api_groups = [""]
    resources  = ["pods", "pods/log", "events"]
    verbs      = ["get", "list", "watch"]
  }

  rule {
    api_groups = ["apps"]
    resources  = ["deployments", "statefulsets", "replicasets"]
    verbs      = ["get", "list", "watch", "create", "patch", "update"]
  }

  # kubectl rollout status and the production rollback path read status subresources.
  rule {
    api_groups = ["apps"]
    resources  = ["deployments/status", "statefulsets/status"]
    verbs      = ["get", "list", "watch"]
  }

  rule {
    api_groups = ["autoscaling"]
    resources  = ["horizontalpodautoscalers"]
    verbs      = ["get", "list", "watch", "create", "patch", "update"]
  }

  rule {
    api_groups = ["networking.k8s.io"]
    resources  = ["ingresses"]
    verbs      = ["get", "list", "watch", "create", "patch", "update"]
  }
}

resource "kubernetes_cluster_role_binding" "fn_deployers" {
  metadata {
    name = "fn-deployers"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role.fn_deployers.metadata[0].name
  }

  # Matches the group name in aws_auth_roles above. These two strings must agree.
  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = "fn-deployers"
  }

  depends_on = [module.eks]
}

###############################################################################
# StorageClass — gp3-encrypted (used by StatefulSets and PVCs)
###############################################################################

resource "kubernetes_storage_class" "gp3_encrypted" {
  metadata {
    name = "gp3-encrypted"
    annotations = {
      "storageclass.kubernetes.io/is-default-class" = "true"
    }
  }

  storage_provisioner    = "ebs.csi.aws.com"
  reclaim_policy         = "Retain"
  volume_binding_mode    = "WaitForFirstConsumer"
  allow_volume_expansion = true

  parameters = {
    type       = "gp3"
    encrypted  = "true"
    kmsKeyId   = aws_kms_key.fn.arn
    iops       = "3000"
    throughput = "125"
  }

  depends_on = [module.eks]
}
