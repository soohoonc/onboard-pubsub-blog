import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsp from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import cdk = require('aws-cdk-lib');

export class OnboardPubsubBlogStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sampleQueue = new sqs.Queue(this, 'sample-queue', {
      queueName: 'sample-queue',
      retentionPeriod: cdk.Duration.days(14),
    });

    new cdk.CfnOutput(this, 'sample-queue-url', {
      value: sampleQueue.queueUrl, // Set environment variables to this value
    })

    const sqsPolicy = new iam.Policy(this, 'sqs-policy', {
      statements: [new iam.PolicyStatement({
        actions: ['sqs:*'],
        resources: [`arn:aws:sqs:*`],
      })],
    });

    const cloudwatchPolicy = new iam.Policy(this, 'cloudwatch-policy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['cloudwatch:*'],
          resources: ['*'],
        }),
      ],
    });

    const ecsTaskRole = new iam.Role(this, 'ecs-tasks-role', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Basic ECS Role'
    });

    const ecsTaskBasicRole = iam.ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AmazonECSTaskExecutionRolePolicy',
    );

    ecsTaskRole.addManagedPolicy(ecsTaskBasicRole);
    ecsTaskRole.attachInlinePolicy(cloudwatchPolicy);
    ecsTaskRole.attachInlinePolicy(sqsPolicy);

    const sampleVpc = new ec2.Vpc(this, 'sample-vpc', {
      vpcName: 'sample-vpc',
    });

    const sampleCluster = new ecs.Cluster(this, 'sample-cluster', {
      clusterName: 'sample-cluster',
      enableFargateCapacityProviders: true,
      vpc: sampleVpc,
    });

    const samplePublisherAsset = new ecr_assets.DockerImageAsset(this, 'sample-publisher-ecr-asset', {
      directory: './app/publisher',
      assetName: 'sample-publisher-ecr-asset',
    });

    const sampleSubscriberAsset = new ecr_assets.DockerImageAsset(this, 'sample-subscriber-ecr-asset', {
      directory: './app/subscriber',
      assetName: 'sample-subscriber-ecr-asset',
    });

    const samplePublisherTask = new ecs.FargateTaskDefinition(this, 'sample-publisher-task-def', {
      family: 'sample-publisher-task-def',
      taskRole: ecsTaskRole,
    });

    const sampleSubscriberTask = new ecs.FargateTaskDefinition(this, 'sample-subscriber-task-def', {
      family: 'sample-subscriber-task-def',
      taskRole: ecsTaskRole,
    });

    const publisherPort = 3000
    samplePublisherTask.addContainer('sample-publisher-container', {
      image: ecs.ContainerImage.fromDockerImageAsset(samplePublisherAsset),
      portMappings: [{
        containerPort: publisherPort
      }],
      memoryLimitMiB: 4096,
      cpu: 1024,
      environment: {
        PORT: `${publisherPort}`,
        SQS_URL: sampleQueue.queueUrl,
        AWS_ACCOUNT_REGION: process.env.AWS_ACCOUNT_REGION!,
      },
      logging: ecs.LogDrivers.awsLogs({
        logGroup: new logs.LogGroup(this, 'sample-publisher-log-group', {
          logGroupName: 'sample-publisher-log-group',
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        streamPrefix: 'sample-publisher-container',
      }),
    });

    const subscriberPort = 3000
    sampleSubscriberTask.addContainer('sample-subscriber-container', {
      image: ecs.ContainerImage.fromDockerImageAsset(sampleSubscriberAsset),
      portMappings: [{
        containerPort: subscriberPort
      }],
      memoryLimitMiB: 4096,
      cpu: 1024,
      environment: {
        PORT: `${subscriberPort}`,
        SQS_URL: sampleQueue.queueUrl,
        AWS_ACCOUNT_REGION: process.env.AWS_ACCOUNT_REGION!,
        OPENAI_MODEL: "gpt-3.5-turbo", // feel free to change
        OPENAI_API_KEY: process.env.OPENAI_API_KEY!,// your api key
      },
      logging: ecs.LogDrivers.awsLogs({
        logGroup: new logs.LogGroup(this, 'sample-subscriber-log-group', {
          logGroupName: 'sample-subscriber-log-group',
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        streamPrefix: 'sample-subscriber-container',
      }),
    });

    new ecsp.ApplicationLoadBalancedFargateService(this, 'sample-publisher-service', {
      cluster: sampleCluster,
      desiredCount: 1,
      taskDefinition: samplePublisherTask,
      serviceName: "sample-publisher-service",
      assignPublicIp: true,
      loadBalancerName: "sample-publisher-lb",
      healthCheckGracePeriod: cdk.Duration.seconds(10),
    });

    new ecsp.ApplicationLoadBalancedFargateService(this, 'sample-subscriber-service', {
      cluster: sampleCluster,
      desiredCount: 1,
      taskDefinition: sampleSubscriberTask,
      serviceName: "sample-subscriber-service",
      assignPublicIp: true,
      loadBalancerName: "sample-subscriber-lb",
      healthCheckGracePeriod: cdk.Duration.seconds(10),
    });
  }
}