import {
  CodePipelineClient,
  DisableStageTransitionCommand,
  EnableStageTransitionCommand,
  GetPipelineStateCommand,
} from "@aws-sdk/client-codepipeline";

/**
 *
 * @param {*} event Stage transition data, in form of: 
 *  { 
 *    "stageName": "name"
 *  }
 * @param {*} context
 * @returns 200 if successful in form of: {
      "state": "Disabled" || "Enabled",
      "oldState": "Enabled" || "Disabled"
    }), throws error otherwise.
 */
export const handler = async (event, context) => {
  const stageName = event.stageName;
  const validStageNames = process.env.STAGE_NAMES.split(",").map((name) =>
    name.trim()
  );
  if (validStageNames.indexOf(stageName) == -1) {
    console.log("Invalid stage name: " + stageName);
    throw new Error("Invalid stage name: " + stageName);
  }

  const client = new CodePipelineClient();

  //get transition for the given state
  const command = new GetPipelineStateCommand({ name: "Demo-Website" });
  const getPipelineStateResult = await client.send(command);
  //console.log(getPipelineStateResult.stageStates.filter(stage => stage.stageName))
  var enabled = getPipelineStateResult.stageStates.find(
    (stage) => stage.stageName == stageName
  ).inboundTransitionState.enabled;
  console.log(`Stage ${stageName} is ${enabled ? "Enabled" : "Disabled"}`);

  var params = {
    pipelineName: "Demo-Website",
    stageName: event.stageName,
    reason: "Flipped by lambda",
    transitionType: "Inbound",
  };

  if (enabled === true) {
    const command = new DisableStageTransitionCommand(params);
    try {
      const response = await client.send(command);
      console.log(`Stage transition disabled for stage: ${stageName}`);
    } catch (error) {
      console.error("Exception from DisableStageTransitionCommand: ", error);
      throw new Error(error);
    }
  } else {
    const command = new EnableStageTransitionCommand(params);
    try {
      const response = await client.send(command);
      console.log(`Stage transition enabled for stage: ${stageName}`);
    } catch (error) {
      console.error("Exception from DisableStageTransitionCommand: ", error);
      throw new Error(error);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      state: enabled ? "Disabled" : "Enabled",
      oldState: enabled ? "Enabled" : "Disabled",
    }),
  };
};
