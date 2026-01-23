#!/bin/bash
set -e

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REPO_NAME="scalereach-api"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# ECR repository URL
ECR_URL="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"

echo "Building Docker image..."
docker build -t ${ECR_REPO_NAME}:${IMAGE_TAG} .

echo "Logging into ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_URL}

echo "Creating ECR repository if it doesn't exist..."
aws ecr describe-repositories --repository-names ${ECR_REPO_NAME} --region ${AWS_REGION} 2>/dev/null || \
  aws ecr create-repository --repository-name ${ECR_REPO_NAME} --region ${AWS_REGION}

echo "Tagging image..."
docker tag ${ECR_REPO_NAME}:${IMAGE_TAG} ${ECR_URL}:${IMAGE_TAG}

echo "Pushing to ECR..."
docker push ${ECR_URL}:${IMAGE_TAG}

echo "✓ Image pushed to ${ECR_URL}:${IMAGE_TAG}"
