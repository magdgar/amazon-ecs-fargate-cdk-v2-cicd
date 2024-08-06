// import * as ec2 from 'aws-cdk-lib/aws-ec2';
// import * as ecs from 'aws-cdk-lib/aws-ecs';
// import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
// import * as path from 'path';
// import * as appconfig from 'aws-cdk-lib/aws-appconfig';
// import * as cdk from 'aws-cdk-lib';
// import * as evidently from 'aws-cdk-lib/aws-evidently';
// import * as iam from 'aws-cdk-lib/aws-iam';


// // interface EvidentlyResourcesProps extends cdk.NestedStackProps {
// //     ecs_service: ecs.FargateService
// //   }

// export class EvidentlyClientSideEvaluationEcsStack extends cdk.Stack {
//   constructor(app: cdk.App, id: string, props: EvidentlyResourcesProps) {
//     super(app, id);

//     const cluster = props.ecs_service.cluster

//     // Create AppConfig resources
//     const application = new appconfig.CfnApplication(this,'AppConfigApplication', {
//       name: 'SummitDemoApplication'
//     });

//     const environment = new appconfig.CfnEnvironment(this, 'AppConfigEnvironment', {
//       applicationId: application.ref,
//       name: 'SummitDemoEnvironment'
//     });

//     // Create Evidently resources
//     const project = new evidently.CfnProject(this, 'EvidentlyProject', {
//       name: 'SummitDemoWebPage',
//       appConfigResource: {
//         applicationId: application.ref,
//         environmentId: environment.ref
//       }
//     });

//     const feature = new evidently.CfnFeature(this, 'EvidentlyFeature', {
//       project: project.name,
//       name: 'SearchBar',
//       variations: [
//         {
//           booleanValue: false,
//           variationName: SINGLE_VIDEO_PAGE
//         },
//         {
//           booleanValue: true,
//           variationName: MULTIPLE_VIDEO_PAGE
//         }
//       ]
//     })
//     feature.addDependsOn(project)

//     const launch = new evidently.CfnLaunch(this, 'EvidentlyLaunch', {
//       project: project.name,
//       name: 'MyLaunch',
//       executionStatus: {
//         status: 'START'
//       },
//       groups: [
//         {
//           feature: feature.name,
//           variation: SINGLE_VIDEO_PAGE,
//           groupName: SINGLE_VIDEO_PAGE
//         },
//         {
//           feature: feature.name,
//           variation: MULTIPLE_VIDEO_PAGE,
//           groupName: MULTIPLE_VIDEO_PAGE
//         }
//       ],
//       scheduledSplitsConfig: [{
//         // This must be a timestamp. Choosing a start time in the past with status START will start the launch immediately:
//         // https://docs.aws.amazon.com/cloudwatchevidently/latest/APIReference/API_ScheduledSplitConfig.html#cloudwatchevidently-Type-ScheduledSplitConfig-startTime
//         startTime: '2022-01-01T00:00:00Z',
//         groupWeights: [
//           {
//             groupName: SINGLE_VIDEO_PAGE,
//             splitWeight: 90000
//           },
//           {
//             groupName: MULTIPLE_VIDEO_PAGE,
//             splitWeight: 10000
//           }
//         ]
//       }]
//     })
//     launch.addDependsOn(feature)

//     const configuration = `applications/${application.ref}/environments/${environment.ref}/configurations/${project.name}`
//     service.taskDefinition.addContainer('AppConfigAgent', {
//       image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-appconfig/aws-appconfig-agent:2.x'),
//       portMappings: [{
//         containerPort: 2772
//       }],
//       environment: {
//         EVIDENTLY_CONFIGURATIONS: configuration,
//         PREFETCH_LIST: configuration
//       }
//     })

    // service.taskDefinition.taskRole.addToPrincipalPolicy(
    //   new iam.PolicyStatement({
    //     actions: ['appconfig:StartConfigurationSession', 'appconfig:GetLatestConfiguration'],
    //     effect: iam.Effect.ALLOW,
    //     resources: [`arn:aws:appconfig:${AWS_REGION}:${AWS_ACCOUNT}:application/${application.ref}/environment/${environment.ref}/configuration/*`]
    //   })
    // )
    // service.taskDefinition.taskRole.addToPrincipalPolicy(
    //   new iam.PolicyStatement({
    //     actions: ['evidently:PutProjectEvents'],
    //     effect: iam.Effect.ALLOW,
    //     resources: [`arn:aws:evidently:${AWS_REGION}:${AWS_ACCOUNT}:project/${project.name}`]
    //   })
    // )

}
