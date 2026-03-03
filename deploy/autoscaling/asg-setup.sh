#!/bin/bash
# Creates the full AWS autoscaling infrastructure for ScaleReach workers.
# Run once from your local machine with AWS CLI configured.
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - Base AMI already baked (see README.md step 1)
#   - VPC/subnet IDs for your EC2 region
#   - Security group that allows outbound + port 3002 inbound from ALB/monitoring
#
# Usage:
#   export AWS_REGION=us-east-1
#   export BASE_AMI_ID=ami-xxxxxxxxxxxxxxxxx   # your baked AMI
#   export SUBNET_IDS="subnet-aaa,subnet-bbb"  # comma-separated
#   export SECURITY_GROUP_ID=sg-xxxxxxxxxxxxxxxxx
#   export KEY_NAME=scalereach-worker           # EC2 key pair name
#   ./asg-setup.sh

set -e

AWS_REGION="${AWS_REGION:-us-east-1}"
CLUSTER_NAME="scalereach-workers"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.2xlarge}"
MIN_SIZE="${MIN_SIZE:-1}"
MAX_SIZE="${MAX_SIZE:-10}"
DESIRED="${DESIRED:-1}"
NAMESPACE="ScaleReach/Worker"

echo "=== ScaleReach Worker ASG Setup ==="
echo "Region:        $AWS_REGION"
echo "Instance type: $INSTANCE_TYPE"
echo "Min/Max/Desired: $MIN_SIZE/$MAX_SIZE/$DESIRED"
echo ""

# ── 1. IAM role for EC2 instances (SSM + CloudWatch) ─────────────────────────
echo "[1/7] Creating IAM role for worker instances..."

aws iam create-role \
  --role-name ScaleReachWorkerRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Service":"ec2.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }]
  }' \
  --region "$AWS_REGION" 2>/dev/null || echo "  Role already exists, skipping."

# Attach policies: SSM (for env vars), CloudWatch agent, EC2 describe (for self-awareness)
for policy in \
  "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore" \
  "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"; do
  aws iam attach-role-policy \
    --role-name ScaleReachWorkerRole \
    --policy-arn "$policy" 2>/dev/null || true
done

# Allow reading SSM parameters
aws iam put-role-policy \
  --role-name ScaleReachWorkerRole \
  --policy-name ScaleReachSSMAccess \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Action":["ssm:GetParameter","ssm:GetParameters"],
      "Resource":"arn:aws:ssm:*:*:parameter/scalereach/*"
    }]
  }' 2>/dev/null || true

aws iam create-instance-profile \
  --instance-profile-name ScaleReachWorkerProfile \
  --region "$AWS_REGION" 2>/dev/null || echo "  Instance profile already exists."

aws iam add-role-to-instance-profile \
  --instance-profile-name ScaleReachWorkerProfile \
  --role-name ScaleReachWorkerRole 2>/dev/null || true

echo "  IAM role ready."

# ── 2. Launch Template ────────────────────────────────────────────────────────
echo "[2/7] Creating launch template..."

USER_DATA=$(base64 -w 0 "$(dirname "$0")/user-data.sh")

LAUNCH_TEMPLATE_ID=$(aws ec2 create-launch-template \
  --launch-template-name scalereach-worker \
  --version-description "ScaleReach worker v1" \
  --launch-template-data "{
    \"ImageId\": \"$BASE_AMI_ID\",
    \"InstanceType\": \"$INSTANCE_TYPE\",
    \"KeyName\": \"$KEY_NAME\",
    \"SecurityGroupIds\": [\"$SECURITY_GROUP_ID\"],
    \"IamInstanceProfile\": {\"Name\": \"ScaleReachWorkerProfile\"},
    \"UserData\": \"$USER_DATA\",
    \"BlockDeviceMappings\": [{
      \"DeviceName\": \"/dev/sda1\",
      \"Ebs\": {\"VolumeSize\": 30, \"VolumeType\": \"gp3\", \"DeleteOnTermination\": true}
    }],
    \"TagSpecifications\": [{
      \"ResourceType\": \"instance\",
      \"Tags\": [
        {\"Key\": \"Name\", \"Value\": \"scalereach-worker\"},
        {\"Key\": \"Project\", \"Value\": \"scalereach\"},
        {\"Key\": \"Role\", \"Value\": \"worker\"}
      ]
    }],
    \"MetadataOptions\": {\"HttpTokens\": \"required\", \"HttpEndpoint\": \"enabled\"}
  }" \
  --region "$AWS_REGION" \
  --query "LaunchTemplate.LaunchTemplateId" \
  --output text)

echo "  Launch template: $LAUNCH_TEMPLATE_ID"

# ── 3. Auto Scaling Group ─────────────────────────────────────────────────────
echo "[3/7] Creating Auto Scaling Group..."

# Convert comma-separated subnets to space-separated for CLI
SUBNET_LIST=$(echo "$SUBNET_IDS" | tr ',' ' ')

aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name "$CLUSTER_NAME" \
  --launch-template "LaunchTemplateId=$LAUNCH_TEMPLATE_ID,Version=\$Latest" \
  --min-size "$MIN_SIZE" \
  --max-size "$MAX_SIZE" \
  --desired-capacity "$DESIRED" \
  --vpc-zone-identifier "$SUBNET_IDS" \
  --health-check-type EC2 \
  --health-check-grace-period 120 \
  --default-cooldown 180 \
  --tags \
    "Key=Name,Value=scalereach-worker,PropagateAtLaunch=true" \
    "Key=Project,Value=scalereach,PropagateAtLaunch=true" \
  --region "$AWS_REGION"

echo "  ASG created: $CLUSTER_NAME"

# ── 4. Scale-OUT policy (add instances when queue is deep) ────────────────────
echo "[4/7] Creating scaling policies..."

SCALE_OUT_ARN=$(aws autoscaling put-scaling-policy \
  --auto-scaling-group-name "$CLUSTER_NAME" \
  --policy-name "scalereach-scale-out" \
  --policy-type "StepScaling" \
  --adjustment-type "ChangeInCapacity" \
  --step-adjustments \
    "MetricIntervalLowerBound=0,MetricIntervalUpperBound=20,ScalingAdjustment=1" \
    "MetricIntervalLowerBound=20,MetricIntervalUpperBound=50,ScalingAdjustment=2" \
    "MetricIntervalLowerBound=50,ScalingAdjustment=3" \
  --cooldown 120 \
  --region "$AWS_REGION" \
  --query "PolicyARN" \
  --output text)

# Scale-IN policy (remove instances when queue is empty)
SCALE_IN_ARN=$(aws autoscaling put-scaling-policy \
  --auto-scaling-group-name "$CLUSTER_NAME" \
  --policy-name "scalereach-scale-in" \
  --policy-type "StepScaling" \
  --adjustment-type "ChangeInCapacity" \
  --step-adjustments \
    "MetricIntervalUpperBound=0,ScalingAdjustment=-1" \
  --cooldown 300 \
  --region "$AWS_REGION" \
  --query "PolicyARN" \
  --output text)

echo "  Scale-out policy: $SCALE_OUT_ARN"
echo "  Scale-in policy:  $SCALE_IN_ARN"

# ── 5. CloudWatch Alarms ──────────────────────────────────────────────────────
echo "[5/7] Creating CloudWatch alarms..."

# Scale OUT when TotalPendingJobs > 5 for 2 consecutive minutes
aws cloudwatch put-metric-alarm \
  --alarm-name "scalereach-queue-high" \
  --alarm-description "Scale out workers when queue depth is high" \
  --namespace "$NAMESPACE" \
  --metric-name "TotalPendingJobs" \
  --dimensions "Name=Environment,Value=production" \
  --statistic "Average" \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 5 \
  --comparison-operator "GreaterThanOrEqualToThreshold" \
  --alarm-actions "$SCALE_OUT_ARN" \
  --treat-missing-data "notBreaching" \
  --region "$AWS_REGION"

# Scale IN when TotalPendingJobs < 2 for 5 consecutive minutes
aws cloudwatch put-metric-alarm \
  --alarm-name "scalereach-queue-low" \
  --alarm-description "Scale in workers when queue is idle" \
  --namespace "$NAMESPACE" \
  --metric-name "TotalPendingJobs" \
  --dimensions "Name=Environment,Value=production" \
  --statistic "Average" \
  --period 60 \
  --evaluation-periods 5 \
  --threshold 2 \
  --comparison-operator "LessThanThreshold" \
  --alarm-actions "$SCALE_IN_ARN" \
  --treat-missing-data "notBreaching" \
  --region "$AWS_REGION"

echo "  Alarms created."

# ── 6. Lambda metric publisher ────────────────────────────────────────────────
echo "[6/7] Deploying metric publisher Lambda..."

# Package the Lambda
cd "$(dirname "$0")"
npm install --prefix /tmp/metric-lambda @aws-sdk/client-cloudwatch ioredis 2>/dev/null
cp metric-publisher.ts /tmp/metric-lambda/index.ts
cd /tmp/metric-lambda
npx tsc --target ES2020 --module commonjs --outDir dist index.ts 2>/dev/null || true
cd dist && zip -r /tmp/metric-publisher.zip . && cd ..

LAMBDA_ROLE_ARN=$(aws iam get-role \
  --role-name ScaleReachWorkerRole \
  --query "Role.Arn" \
  --output text \
  --region "$AWS_REGION")

# Get Redis password from SSM
REDIS_PASSWORD=$(aws ssm get-parameter \
  --name "/scalereach/redis-password" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "botyoo")

aws lambda create-function \
  --function-name scalereach-queue-metric-publisher \
  --runtime nodejs20.x \
  --role "$LAMBDA_ROLE_ARN" \
  --handler index.handler \
  --zip-file fileb:///tmp/metric-publisher.zip \
  --timeout 30 \
  --environment "Variables={
    REDIS_HOST=13.204.63.21,
    REDIS_PORT=6379,
    REDIS_PASSWORD=$REDIS_PASSWORD,
    ENVIRONMENT=production
  }" \
  --region "$AWS_REGION" 2>/dev/null || \
aws lambda update-function-code \
  --function-name scalereach-queue-metric-publisher \
  --zip-file fileb:///tmp/metric-publisher.zip \
  --region "$AWS_REGION"

# EventBridge rule: trigger every minute
RULE_ARN=$(aws events put-rule \
  --name "scalereach-metric-publisher" \
  --schedule-expression "rate(1 minute)" \
  --state ENABLED \
  --region "$AWS_REGION" \
  --query "RuleArn" \
  --output text)

LAMBDA_ARN=$(aws lambda get-function \
  --function-name scalereach-queue-metric-publisher \
  --query "Configuration.FunctionArn" \
  --output text \
  --region "$AWS_REGION")

aws lambda add-permission \
  --function-name scalereach-queue-metric-publisher \
  --statement-id EventBridgeInvoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn "$RULE_ARN" \
  --region "$AWS_REGION" 2>/dev/null || true

aws events put-targets \
  --rule "scalereach-metric-publisher" \
  --targets "Id=1,Arn=$LAMBDA_ARN" \
  --region "$AWS_REGION"

echo "  Lambda + EventBridge rule created."

# ── 7. Store secrets in SSM ───────────────────────────────────────────────────
echo "[7/7] Reminder: store secrets in SSM if not already done."
echo ""
echo "  Run these commands to store your env vars:"
echo ""
echo "  # Full .env.production as a single SSM parameter:"
echo "  aws ssm put-parameter \\"
echo "    --name '/scalereach/worker/env' \\"
echo "    --type SecureString \\"
echo "    --value \"\$(cat scalereach-tmkoc/.env.production)\" \\"
echo "    --region $AWS_REGION"
echo ""
echo "  # YouTube cookies:"
echo "  aws ssm put-parameter \\"
echo "    --name '/scalereach/youtube-cookies' \\"
echo "    --type SecureString \\"
echo "    --value \"\$(cat scalereach-tmkoc/config/youtube_cookies.txt)\" \\"
echo "    --region $AWS_REGION"
echo ""
echo "  # Redis password:"
echo "  aws ssm put-parameter \\"
echo "    --name '/scalereach/redis-password' \\"
echo "    --type SecureString \\"
echo "    --value 'botyoo' \\"
echo "    --region $AWS_REGION"

echo ""
echo "=== ASG Setup Complete ==="
echo ""
echo "Summary:"
echo "  ASG:            $CLUSTER_NAME (min=$MIN_SIZE, max=$MAX_SIZE)"
echo "  Launch template: $LAUNCH_TEMPLATE_ID"
echo "  Scale out at:   >= 5 pending jobs (2 min sustained)"
echo "  Scale in at:    < 2 pending jobs (5 min sustained)"
echo "  Metric Lambda:  every 60s → CloudWatch namespace '$NAMESPACE'"
echo ""
echo "Monitor:"
echo "  aws cloudwatch get-metric-statistics \\"
echo "    --namespace '$NAMESPACE' \\"
echo "    --metric-name TotalPendingJobs \\"
echo "    --dimensions Name=Environment,Value=production \\"
echo "    --start-time \$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \\"
echo "    --end-time \$(date -u +%Y-%m-%dT%H:%M:%S) \\"
echo "    --period 60 --statistics Average \\"
echo "    --region $AWS_REGION"
