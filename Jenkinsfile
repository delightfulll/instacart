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
    stage('Checkout') { // pull this repo on the Jenkins agent
      steps {
        checkout scm
      }
    }

    stage('Login to ECR') { // docker needs this before it can push the API image
      steps {
        sh 'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY'
      }
    }

    stage('Build') { // build the backend image for linux/amd64 and push it
      steps {
        sh '''
          docker buildx build \
            --platform linux/amd64 \
            --provenance=false \
            --sbom=false \
            --push \
            -t $IMAGE:$BUILD_NUMBER \
            -t $IMAGE:latest \
            backend
        '''
      }
    }

    stage('Push') { // confirm the tag exists in ECR. The build stage already pushed it.
      steps {
        sh 'docker buildx imagetools inspect $IMAGE:$BUILD_NUMBER'
      }
    }

    stage('Deploy to ECS') { // point the running service at the new image and start new tasks
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
# Copy the live task definition, swap in this build's image, drop fields register-task-definition rejects.
import json, os

image = os.environ["IMAGE"] + ":" + os.environ["BUILD_NUMBER"]
repo = os.environ["ECR_REPO"]

with open("task-def.json") as f:
    td = json.load(f)

for container in td["containerDefinitions"]:
    if repo in container.get("image", ""):
        container["image"] = image

td["runtimePlatform"] = {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX",
}

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
