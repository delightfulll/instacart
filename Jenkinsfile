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
        sh 'docker build -t $IMAGE:$BUILD_NUMBER -t $IMAGE:latest backend'
      }
    }

    stage('Push') {
      steps {
        sh 'docker push $IMAGE:$BUILD_NUMBER'
        sh 'docker push $IMAGE:latest'
      }
    }

    stage('Deploy to ECS') {
      steps {
        sh 'aws ecs update-service --cluster $CLUSTER --service $SERVICE --force-new-deployment --region $AWS_REGION'
      }
    }
  }
}