import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codestarnotifications from "aws-cdk-lib/aws-codestarnotifications";
import * as lambda from "aws-cdk-lib/aws-lambda";

import { Construct } from "constructs";

const baseImage = "public.ecr.aws/nginx/nginx-unprivileged";
export class ZurichDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const topicMap = this.createNotificationTopics();

    // GitHub

    const githubUserName = new cdk.CfnParameter(this, "githubUserName", {
      type: "String",
      description: "Github username for source code repository",
    });

    const githubRepository = new cdk.CfnParameter(this, "githubRespository", {
      type: "String",
      description: "Github source code repository",
      default: "amazon-ecs-fargate-cdk-v2-cicd",
    });

    const githubPersonalTokenSecretName = new cdk.CfnParameter(
      this,
      "githubPersonalTokenSecretName",
      {
        type: "String",
        description:
          "The name of the AWS Secrets Manager Secret which holds the GitHub Personal Access Token for this project.",
        default:
          "/aws-samples/amazon-ecs-fargate-cdk-v2-cicd/github/personal_access_token",
      }
    );

    const gitHubSource = codebuild.Source.gitHub({
      owner: githubUserName.valueAsString,
      repo: githubRepository.valueAsString,
      webhook: true, // optional, default: true if `webhookfilteres` were provided, false otherwise
      webhookFilters: [
        codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH).andBranchIs(
          "main"
        ),
      ], // optional, by default all pushes and pull requests will trigger a build
    });

    //CodeCommit
    /*const codeCommitRepository = new cdk.aws_codecommit.Repository(
      this,
      "codeCommitRepo",
      {
        repositoryName: "demo-web-app",
        description: "flask app deployed with codepipeline",
      }
    );
    codeCommitRepository.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const codeCommitSource = codebuild.Source.codeCommit({
      repository: codeCommitRepository,
    });*/

    const ecrRepo = new ecr.Repository(this, "ecrRepo", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    const vpc = new ec2.Vpc(this, "ecs-cdk-vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      natGateways: 1,
      maxAzs: 2, // does a sample need 3 az's? No, but 2 is a must for LoadBalancer.
    });

    const clusterAdminRole = new iam.Role(this, "adminrole", {
      assumedBy: new iam.AccountRootPrincipal(),
    });

    const cluster = new ecs.Cluster(this, "ecs-cluster", {
      vpc: vpc,
    });

    const fargateProdService = this.createService(baseImage, cluster, "prod");

    const fargateBetaService = this.createService(baseImage, cluster, "beta");

    //#region build

    const buildLogGroup = new cdk.aws_logs.LogGroup(this, "build-log-group", {
      logGroupName: "zurich-demo/build-logs",
      retention: 30,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // codebuild - project
    const codeBuildProject = new codebuild.Project(this, "codeBuildProject", {
      projectName: `${this.stackName}`,
      //CodeCommit
      source: gitHubSource, // codeCommitSource || gitHubSource
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        privileged: true,
      },
      environmentVariables: {
        /*cluster_name: {
          value: `${cluster.clusterName}`,
        },*/
        ecr_repo_uri: {
          value: `${ecrRepo.repositoryUri}`,
        },
      },
      badge: true,
      // TODO - I had to hardcode tag here
      buildSpec: codebuild.BuildSpec.fromObject({
        version: 0.2,
        phases: {
          pre_build: {
            /*
            commands: [
              'env',
              'export tag=${CODEBUILD_RESOLVED_SOURCE_VERSION}'
            ]
            */
            commands: ["env", "export tag=latest"],
          },
          build: {
            commands: [
              "cd flask-docker-app",
              `docker build -t $ecr_repo_uri:$tag .`,
              `aws ecr get-login-password --region ${
                cdk.Stack.of(this).region
              } | docker login --username AWS --password-stdin ${
                cdk.Stack.of(this).account
              }.dkr.ecr.${cdk.Stack.of(this).region}.amazonaws.com`,
              "docker push $ecr_repo_uri:$tag",
            ],
          },
          post_build: {
            commands: [
              'echo "in post-build stage"',
              "cd ..",
              'printf \'[{"name":"flask-app","imageUri":"%s"}]\' $ecr_repo_uri:$tag > imagedefinitions.json',
              "pwd; ls -al; cat imagedefinitions.json",
            ],
          },
        },
        artifacts: {
          files: ["imagedefinitions.json"],
        },
      }),
      logging: {
        cloudWatch: {
          logGroup: buildLogGroup,
        },
      },
      timeout: cdk.Duration.minutes(10),
    });

    codeBuildProject.notifyOn(
      "BuildStartedNotification",
      topicMap.get("BuildStartedNotification")!,
      {
        detailType: codestarnotifications.DetailType.FULL,
        notificationRuleName: "BuildInProgressNotificationRule",
        enabled: true,
        createdBy: "T",
        events: [codebuild.ProjectNotificationEvents.BUILD_IN_PROGRESS],
      }
    );

    codeBuildProject.notifyOnBuildFailed(
      "BuildFailedNotificationRule",
      topicMap.get("BuildFailedNotification")!,
      {
        detailType: codestarnotifications.DetailType.FULL,
        notificationRuleName: "BuildFailedNotificationRule",
        enabled: true,
        createdBy: "T",
      }
    );
    codeBuildProject.notifyOnBuildSucceeded(
      "BuildSucceededNotificationRule",
      topicMap.get("BuildSucceededNotification")!,
      {
        detailType: codestarnotifications.DetailType.FULL,
        notificationRuleName: "BuildSucceededNotificationRule",
        enabled: true,
        createdBy: "T",
      }
    );

    //#endregion build

    // ***pipeline actions***

    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: "github_source",
      owner: githubUserName.valueAsString,
      repo: githubRepository.valueAsString,
      branch: "main",
      oauthToken: cdk.SecretValue.secretsManager(
        githubPersonalTokenSecretName.valueAsString
      ),
      output: sourceOutput,
    });

    //CodeCommit
    /*
    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: "source",
      repository: codeCommitRepository,
      output: sourceOutput,
    });
    */

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: "codebuild",
      project: codeBuildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });

    const deployToBetaAction = new codepipeline_actions.EcsDeployAction({
      actionName: "deployToAlphaAction",
      service: fargateBetaService.service,
      imageFile: new codepipeline.ArtifactPath(
        buildOutput,
        `imagedefinitions.json`
      ),
      deploymentTimeout: cdk.Duration.minutes(5),
    });

    const manualBetaApprovalAction =
      new codepipeline_actions.ManualApprovalAction({
        actionName: "approve",
        externalEntityLink: fargateBetaService.loadBalancer.loadBalancerDnsName,
        additionalInformation: "Have a look at the site",
        notificationTopic: topicMap.get("ManualApprovalNotification"),
      });

    const deployToProdAction = new codepipeline_actions.EcsDeployAction({
      actionName: "deployAction",
      service: fargateProdService.service,
      imageFile: new codepipeline.ArtifactPath(
        buildOutput,
        `imagedefinitions.json`
      ),
      deploymentTimeout: cdk.Duration.minutes(5),
    });

    // pipeline stages

    const pipeline = new codepipeline.Pipeline(this, "myecspipeline", {
      pipelineName: "Demo-Website",
      executionMode: codepipeline.ExecutionMode.QUEUED,
      stages: [
        {
          stageName: "source",
          actions: [sourceAction],
        },
        {
          stageName: "build",
          actions: [buildAction],
        },
        {
          stageName: "deploy-to-beta",
          actions: [deployToBetaAction],
        },
        {
          stageName: "approve",
          actions: [manualBetaApprovalAction],
        },
        {
          stageName: "deploy-to-prod-1",
          actions: [deployToProdAction],
        },
      ],
    });

    pipeline.notifyOn(
      "Notification",
      topicMap.get("PipelineExecutionNotification")!,
      {
        detailType: codestarnotifications.DetailType.FULL,
        notificationRuleName: "PipelineExecutionNotificationRule",
        enabled: true,
        createdBy: "T",
        events: [
          codepipeline.PipelineNotificationEvents.PIPELINE_EXECUTION_STARTED,
          codepipeline.PipelineNotificationEvents.PIPELINE_EXECUTION_FAILED,
          codepipeline.PipelineNotificationEvents.PIPELINE_EXECUTION_SUCCEEDED,
        ],
      }
    );

    ecrRepo.grantPullPush(codeBuildProject.role!);
    codeBuildProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ecs:describecluster",
          "ecr:getauthorizationtoken",
          "ecr:batchchecklayeravailability",
          "ecr:batchgetimage",
          "ecr:getdownloadurlforlayer",
        ],
        resources: [`${cluster.clusterArn}`],
      })
    );

    const approvalFunction = new lambda.Function(this, "approvalFunction", {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: "approvalLambda.handler",
      code: lambda.Code.fromAsset("pipeline-helpers/approval", {
        ignoreMode: cdk.IgnoreMode.GIT,
      }),
      logGroup: new cdk.aws_logs.LogGroup(this, `lambda-approval-log-group`, {
        logGroupName: `zurich-demo/lambda/approval`,
        retention: 30,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      role: new iam.Role(this, "approvalFunctionRole", {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
        ],
        inlinePolicies: {
          inline: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ["codepipeline:GetPipelineState"],
                resources: [`${pipeline.pipelineArn}`],
              }),
              new iam.PolicyStatement({
                actions: ["codepipeline:PutApprovalResult"],
                resources: [`${pipeline.pipelineArn}/approve/approve`],
              }),
            ],
          }),
        },
      }),
    });

    const setStageTransitionFunction = new lambda.Function(
      this,
      "stageTransitionFunction",
      {
        runtime: lambda.Runtime.NODEJS_LATEST,
        handler: "setStageTransition.handler",
        code: lambda.Code.fromAsset("pipeline-helpers/setStageTransition", {
          ignoreMode: cdk.IgnoreMode.GIT,
        }),
        logGroup: new cdk.aws_logs.LogGroup(
          this,
          `lambda-set-stage-transition-log-group`,
          {
            logGroupName: `zurich-demo/lambda/setStagetransition`,
            retention: 30,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }
        ),
        environment: {
          STAGE_NAMES: pipeline.stages
            .map((stage) => stage.stageName)
            .join(","),
        },
        role: new iam.Role(this, "setStageTransitionFunctionRole", {
          assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName(
              "service-role/AWSLambdaBasicExecutionRole"
            ),
          ],
          inlinePolicies: {
            inline: new iam.PolicyDocument({
              statements: [
                new iam.PolicyStatement({
                  actions: [
                    "codepipeline:EnableStageTransition",
                    "codepipeline:DisableStageTransition",
                  ],
                  resources: [`${pipeline.pipelineArn}/*`],
                }),
              ],
            }),
          },
        }),
      }
    );

    const flipStageTransitionFunction = new lambda.Function(
      this,
      "flipStageTransitionFunction",
      {
        runtime: lambda.Runtime.NODEJS_LATEST,
        handler: "flipStageTransition.handler",
        code: lambda.Code.fromAsset("pipeline-helpers/flipStageTransition", {
          ignoreMode: cdk.IgnoreMode.GIT,
        }),
        logGroup: new cdk.aws_logs.LogGroup(
          this,
          `lambda-flip-stage-transition-log-group`,
          {
            logGroupName: `zurich-demo/lambda/flipStagetransition`,
            retention: 30,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }
        ),
        environment: {
          STAGE_NAMES: pipeline.stages
            .map((stage) => stage.stageName)
            .join(","),
        },
        role: new iam.Role(this, "flipStageTransitionFunctionRole", {
          assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName(
              "service-role/AWSLambdaBasicExecutionRole"
            ),
          ],
          inlinePolicies: {
            inline: new iam.PolicyDocument({
              statements: [
                new iam.PolicyStatement({
                  actions: [
                    "codepipeline:EnableStageTransition",
                    "codepipeline:DisableStageTransition",
                  ],
                  resources: [`${pipeline.pipelineArn}/*`],
                }),
                new iam.PolicyStatement({
                  actions: ["codepipeline:GetPipelineState"],
                  resources: [`${pipeline.pipelineArn}`],
                }),
              ],
            }),
          },
        }),
      }
    );

    new cdk.CfnOutput(this, "image", {
      value: ecrRepo.repositoryUri + ":latest",
    });
    new cdk.CfnOutput(this, "BetaLoadbalancerDns", {
      value: fargateBetaService.loadBalancer.loadBalancerDnsName,
    });
    new cdk.CfnOutput(this, "ProdLoadbalancerDns", {
      value: fargateProdService.loadBalancer.loadBalancerDnsName,
    });
  }

  private createNotificationTopics(): Map<String, sns.Topic> {
    const notificationTopics = [
      "PipelineExecutionNotification",
      "ManualApprovalNotification",
      "BuildStartedNotification",
      "BuildFailedNotification",
      "BuildSucceededNotification",
    ];
    const topicMap = new Map<String, sns.Topic>();

    notificationTopics.forEach((topicName) => {
      const notificationTopic = new sns.Topic(this, topicName, {
        topicName: topicName,
      });
      notificationTopic.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
      topicMap.set(topicName, notificationTopic);
    });
    return topicMap;
  }

  private createService(
    baseImage: string,
    cluster: cdk.aws_ecs.Cluster,
    stageName: string
  ) {
    const ecsLogging = new ecs.AwsLogDriver({
      streamPrefix: `ecs-${stageName}-logs`,
      logGroup: new cdk.aws_logs.LogGroup(this, `ecs-log-group-${stageName}`, {
        logGroupName: `zurich-demo/ecs/${stageName}`,
        retention: 30,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    const taskRole = new iam.Role(
      this,
      `ecs-taskrole-${this.stackName}-${stageName}`,
      {
        roleName: `ecs-taskrole-${this.stackName}-${stageName}`,
        assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      }
    );

    const ecsTaskExecutionPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ["*"],
      actions: [
        "ecr:getauthorizationtoken",
        "ecr:batchchecklayeravailability",
        "ecr:getdownloadurlforlayer",
        "ecr:batchgetimage",
        "logs:CreateLogStream",
        "logs:putlogevents",
      ],
    });

    const taskDef = new ecs.FargateTaskDefinition(
      this,
      `ecs-${stageName}-taskdef`,
      {
        taskRole: taskRole,
      }
    );
    taskDef.addToExecutionRolePolicy(ecsTaskExecutionPolicy);
    taskDef.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const container = taskDef.addContainer(`flask-app-container-${stageName}`, {
      containerName: "flask-app",
      image: ecs.ContainerImage.fromRegistry(baseImage),
      memoryLimitMiB: 256,
      cpu: 128,
      logging: ecsLogging,
      portMappings: [
        {
          containerPort: 8080,
          protocol: ecs.Protocol.TCP,
        },
      ],
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:8080 || exit 1"],
        timeout: cdk.Duration.seconds(5),
        retries: 5,
        interval: cdk.Duration.seconds(15),
        startPeriod: cdk.Duration.seconds(30),
      },
    });

    const fargateService =
      new ecs_patterns.ApplicationLoadBalancedFargateService(
        this,
        `ecs-$${stageName}-service`,
        {
          cluster: cluster,
          taskDefinition: taskDef,
          publicLoadBalancer: true,
          desiredCount: 1,
          listenerPort: 80,
          serviceName: `${stageName}-service`,
          loadBalancerName: `${stageName}-service`,
        }
      );

    // where do these constants come from? 6, 10, 60?
    const fargateScaling = fargateService.service.autoScaleTaskCount({
      maxCapacity: 2,
    });

    fargateScaling.scaleOnCpuUtilization("cpuscaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });
    return fargateService;
  }
}
