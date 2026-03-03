#!/bin/bash
# Bake a base AMI from your existing EC2 worker instance.
# This AMI has bun, ffmpeg, yt-dlp, python3, smart_crop deps pre-installed.
# New ASG instances boot from this AMI — no slow apt installs on startup.
#
# Run from your local machine.
# Usage: ./bake-ami.sh

set -e

AWS_REGION="${AWS_REGION:-us-east-1}"
SOURCE_INSTANCE_ID="${SOURCE_INSTANCE_ID:-i-005f32f27449be306}"  # your existing EC2
AMI_NAME="scalereach-worker-$(date +%Y%m%d-%H%M)"

echo "=== Baking ScaleReach Worker AMI ==="
echo "Source instance: $SOURCE_INSTANCE_ID"
echo "AMI name:        $AMI_NAME"
echo ""

# First, clean up instance-specific state before baking
echo "[1/3] Cleaning instance state..."
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@3.93.175.142 "
  # Stop the worker so it's not mid-job when snapshotted
  export PATH='/home/ubuntu/.bun/bin:\$PATH'
  bunx pm2 stop scalereach-worker 2>/dev/null || true

  # Remove instance-specific files that should come from SSM on boot
  rm -f /opt/scalereach/.env.production
  rm -f /opt/scalereach/config/youtube_cookies.txt
  rm -f /opt/scalereach/logs/*.log 2>/dev/null || true

  # Clear temp files
  rm -rf /tmp/scalereach-* 2>/dev/null || true

  echo 'Instance cleaned.'
"

echo "[2/3] Creating AMI (this takes 3-5 minutes)..."
AMI_ID=$(aws ec2 create-image \
  --instance-id "$SOURCE_INSTANCE_ID" \
  --name "$AMI_NAME" \
  --description "ScaleReach worker — bun, ffmpeg, yt-dlp, python3, smart_crop" \
  --no-reboot \
  --region "$AWS_REGION" \
  --query "ImageId" \
  --output text)

echo "  AMI ID: $AMI_ID (pending...)"

# Wait for AMI to be available
echo "[3/3] Waiting for AMI to become available..."
aws ec2 wait image-available \
  --image-ids "$AMI_ID" \
  --region "$AWS_REGION"

echo ""
echo "=== AMI Ready ==="
echo "  AMI ID: $AMI_ID"
echo "  Name:   $AMI_NAME"
echo ""
echo "Next: set BASE_AMI_ID=$AMI_ID and run asg-setup.sh"
echo ""
echo "To update the launch template with this new AMI:"
echo "  aws ec2 create-launch-template-version \\"
echo "    --launch-template-name scalereach-worker \\"
echo "    --source-version 1 \\"
echo "    --launch-template-data '{\"ImageId\":\"$AMI_ID\"}' \\"
echo "    --region $AWS_REGION"
echo ""
echo "  aws autoscaling update-auto-scaling-group \\"
echo "    --auto-scaling-group-name scalereach-workers \\"
echo "    --launch-template 'LaunchTemplateName=scalereach-worker,Version=\$Latest' \\"
echo "    --region $AWS_REGION"

# Restart the worker on the source instance
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@3.93.175.142 "
  export PATH='/home/ubuntu/.bun/bin:\$PATH'
  bunx pm2 start scalereach-worker 2>/dev/null || true
  echo 'Worker restarted.'
"
