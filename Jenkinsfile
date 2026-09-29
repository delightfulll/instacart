pipeline {
  agent any

  environment {
    AWS_REGION   = 'us-east-1'
    ECR_REGISTRY = '103415318595.dkr.ecr.us-east-1.amazonaws.com'
    ECR_REPO     = 'instacart-api'
    CLUSTER      = 'instacartcluster'
    SERVICE      = 'wise-server-oa37df-service-19xmxcey'
    IMAGE        = "${ECR_REGISTRY}/${ECR_REPO}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Login to ECR') {
      steps {
        sh 'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY'
      }
    }

    stage('Build') {
      steps {
        sh '''
          docker buildx build \
            --platform linux/arm64 \
            --provenance=false \
            --sbom=false \
            --push \
            -t $IMAGE:$BUILD_NUMBER \
            -t $IMAGE:latest \
            backend
        '''
      }
    }

    stage('Push') {
      steps {
        sh 'docker buildx imagetools inspect $IMAGE:$BUILD_NUMBER'
      }
    }

    stage('Deploy to ECS') {
      steps {
        sh '''
          set -euo pipefail

          TASK_DEF_ARN=$(aws ecs describe-services \
            --cluster "$CLUSTER" \
            --services "$SERVICE" \
            --region "$AWS_REGION" \
            --query "services[0].taskDefinition" \
            --output text)

          aws ecs describe-task-definition \
            --task-definition "$TASK_DEF_ARN" \
            --region "$AWS_REGION" \
            --query "taskDefinition" \
            --output json > task-def.json

          python3 - <<'PY'
import json, os

image = os.environ["IMAGE"] + ":" + os.environ["BUILD_NUMBER"]
repo = os.environ["ECR_REPO"]

with open("task-def.json") as f:
    td = json.load(f)

for container in td["containerDefinitions"]:
    if repo in container.get("image", ""):
        container["image"] = image

for key in (
    "taskDefinitionArn",
    "revision",
    "status",
    "requiresAttributes",
    "compatibilities",
    "registeredAt",
    "registeredBy",
    "deregisteredAt",
):
    td.pop(key, None)

with open("new-task-def.json", "w") as f:
    json.dump(td, f)
PY

          NEW_ARN=$(aws ecs register-task-definition \
            --cli-input-json file://new-task-def.json \
            --region "$AWS_REGION" \
            --query "taskDefinition.taskDefinitionArn" \
            --output text)

          echo "Deploying $NEW_ARN"

          aws ecs update-service \
            --cluster "$CLUSTER" \
            --service "$SERVICE" \
            --task-definition "$NEW_ARN" \
            --force-new-deployment \
            --region "$AWS_REGION"
        '''
      }
    }
  }
}
