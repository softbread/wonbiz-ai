# AWS Deployment Guide

This directory contains the configuration needed to deploy WonBiz AI to AWS ECS using Fargate. The workflow builds the frontend and API containers, publishes them to Amazon ECR, and updates an ECS service with the new task definition.

## Prerequisites

1. **AWS resources**
   - An ECS cluster and service configured for Fargate with an Application Load Balancer.
   - Two ECR repositories (e.g., `wonbiz-ai-frontend` and `wonbiz-ai-server`).
   - Task execution and task roles with permissions for CloudWatch Logs, pulling from ECR, and reading SSM Parameter Store secrets.
   - VPC subnets and security groups that allow traffic to ports 80 (frontend) and 3001 (API) as needed.

2. **GitHub secrets** (used by the workflow)
   - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` or `AWS_ROLE_TO_ASSUME` (for OIDC authentication).
   - `AWS_REGION`
   - `ECS_CLUSTER` and `ECS_SERVICE` names to deploy to.
   - `ECR_REPOSITORY_FRONTEND` and `ECR_REPOSITORY_SERVER` repository names.
   - Frontend build args (Vite) provided as secrets: `VITE_OPENAI_API_KEY`, `VITE_GROK_API_KEY`, `VITE_GEMINI_API_KEY`, `VITE_ASSEMBLYAI_API_KEY`, `VITE_LLAMA_CLOUD_API_KEY`, `VITE_EMBEDDING_MODEL`, and `VITE_API_BASE_URL` (defaults to `https://s1.wonbiz.com` if not set).
   - Backend runtime secrets in SSM Parameter Store referenced by `aws/ecs-task-def.json` (e.g., `Wonbiz/MONGODB_URI`, `Wonbiz/VOYAGE_API_KEY`, etc.).

3. **CloudWatch Logs**
   - Create a log group named `/ecs/wonbiz-ai` in the target region, or adjust the log group name in `aws/ecs-task-def.json`.

## Deploying with GitHub Actions

The workflow `.github/workflows/aws-deploy.yml` builds and pushes images, updates the task definition, and deploys the ECS service. Trigger it with `workflow_dispatch` or pushes to `main`.

### Inputs the workflow expects
- `AWS_REGION` (from secrets)
- `ECS_CLUSTER` and `ECS_SERVICE` (from secrets)
- `ECR_REPOSITORY_FRONTEND` and `ECR_REPOSITORY_SERVER` (from secrets)
- Vite build args from secrets (keys above)

### How it works
1. Logs into Amazon ECR.
2. Builds the production frontend image with Vite build args and tags it with the commit SHA.
3. Builds the API image from `server/Dockerfile` and tags it with the commit SHA.
4. Renders `aws/ecs-task-def.json` with the new image tags for both containers.
5. Deploys the updated task definition to the configured ECS service.

## Domain and load balancer mapping

To meet the required hostnames, configure your Application Load Balancer with host-based rules that forward traffic to the containers in this task:

- `app.wonbiz.com` → target group pointing to the **frontend** container on port `80`.
- `s1.wonbiz.com` → target group pointing to the **api** container on port `3001`.

Attach both target groups to the same ECS service so each hostname routes to the correct container port. The task definition already exposes the required container ports, and the frontend build uses `https://s1.wonbiz.com` as its default `VITE_API_BASE_URL` to reach the backend.

## Customizing the task definition

Update `aws/ecs-task-def.json` with your AWS account ID, region, IAM role ARNs, VPC settings, and the SSM parameter paths you use. You can also add additional environment variables or secrets for the API container as needed.
