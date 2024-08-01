import {
  CodePipelineClient,
  DisableStageTransitionCommand,
  EnableStageTransitionCommand,
} from "@aws-sdk/client-codepipeline";

/**
 *
 * @param {*} event Stage transition data, in form of: { "stageName": "name", "state": "Enabled" || "Disabled", "reason": "string"}
 * @param {*} context
 * @returns 200 if successful, throws error otherwise.
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

  const state = event.state;
  const validStates = ["Enabled", "Disabled"];
  if (validStates.indexOf(state) == -1) {
    console.log("Invalid state: " + event.state);
    throw new Error("Invalid state: " + event.state);
  }

  const reason = event.reason;

  var params = {
    pipelineName: "Demo-Website",
    stageName: event.stageName,
    reason: reason,
    transitionType: "Inbound",
  };

  const client = new CodePipelineClient();

  if (state == "Disabled") {
    if (reason.length < 1) {
      console.log("Reason required when disabling a stage transition");
      throw new Error("Reason required when disabling a stage transition");
    }

    const command = new DisableStageTransitionCommand(params);
    try {
      const response = await client.send(command);
    } catch (error) {
      console.error("Exception from DisableStageTransitionCommand: ", error);
      throw new Error(error);
    }
  } else {
    const command = new EnableStageTransitionCommand(params);
    try {
      const response = await client.send(command);
    } catch (error) {
      console.error("Exception from DisableStageTransitionCommand: ", error);
      throw new Error(error);
    }
  }

  return {
    statusCode: 200,
    newState: state,
  };
};
