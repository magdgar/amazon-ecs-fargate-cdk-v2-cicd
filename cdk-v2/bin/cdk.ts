#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ZurichDemoStack } from '../lib/ecs_cdk-stack';

const app = new cdk.App();

const env = {
  region:
    app.node.tryGetContext("region") ||
    process.env.CDK_INTEG_REGION ||
    process.env.CDK_DEFAULT_REGION,
  account:
    app.node.tryGetContext("account") ||
    process.env.CDK_INTEG_ACCOUNT ||
    process.env.CDK_DEFAULT_ACCOUNT,
  stackName:
    app.node.tryGetContext("stackName") ||
    process.env.STACK_NAME ||
    "ZurichDemoStack",
};

new ZurichDemoStack(app, env.stackName, { env });

