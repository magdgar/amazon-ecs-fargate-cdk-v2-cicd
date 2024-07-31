import {
  CodePipelineClient,
  PutApprovalResultCommand,
  GetPipelineStateCommand,
} from "@aws-sdk/client-codepipeline";

/**
 * 
 * @param {*} event Approval data, in form of: { "pipelineExecutionId": "GUID", "approvalAction": "Approved" || "Rejected", "summary": "Approval summary"}
 * @param {*} context 
 * @returns 200 if successful, throws error otherwise.
 */
export const handler = async (event, context) => {
  const pipelineExecutionId = event.pipelineExecutionId;//GUID of pipeline execution
  const approvalAction = event.approvalAction; // "Approved"; //|| "Rejected",
  const summary = event.summary;

  if (approvalAction != "Approved" && approvalAction != "Rejected") {
    throw new Error("Invalid approval action");
  }

  const getPipelineStateInput = {
    name: "Demo-Website",
  };

  const client = new CodePipelineClient();

  const getPipelineStateCommand = new GetPipelineStateCommand(
    getPipelineStateInput
  );
  const getPipelineStateResult = await client.send(getPipelineStateCommand);
  const approvalTokens = getPipelineStateResult.stageStates
    .filter(
      (stage) =>
        stage.stageName == "approve" &&
        stage.latestExecution.pipelineExecutionId == pipelineExecutionId
    )
    .flatMap((stageState) => stageState.actionStates)
    .filter(
      (actionState) =>
        actionState.actionName == "approve" &&
        actionState.latestExecution.status == "InProgress"
    )
    .map((actionState) => actionState.latestExecution.token);

  console.log(`${approvalTokens.length} tokens found`);

  if (approvalTokens.length == 0) {
    console.log("No approval tokens found");
    throw new Error("No approval tokens found");
  }

  if (approvalTokens.length == 1) {
    console.log("Answer the single approval");
    const putApprovalInput = {
      pipelineName: "Demo-Website",
      stageName: "approve",
      actionName: "approve",
      result: {
        summary: summary,
        status: approvalAction,
      },
      token: approvalTokens[0],
    };
    const putApprovalCommand = new PutApprovalResultCommand(putApprovalInput);
    const response = await client.send(putApprovalCommand);

    if (response.$metadata.httpStatusCode == 200) {
      console.log("Approval successful");
      return {
        statusCode: 200,
        body: JSON.stringify("Approval successful"),
      };
    } else {
      console.log("Approval failed");
      throw new Error("Approval failed");
    }
  }
};
