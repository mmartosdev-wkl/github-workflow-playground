async function dispatchWorkflows({ github, context, commentId, commentBody }) {
  const { owner, repo } = context.repo;

  // Remove comment
  await github.rest.issues.deleteComment({
    owner: owner,
    repo: repo,
    comment_id: commentId,
  });

  // Get data relative to PR where the comment has been added -> pr.head.sha
  const prNumber = context.issue.number;
  const { data: pr } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber
  });

  // Resolve which gradle tasks should be run
  let tasksToRun = [];
  let compatibleTasks = [];

  if (commentBody === "recordScreenshots") {
    tasksToRun = ["recordScreenshotTests"];
  } else if (commentBody === "runChecks") {
    tasksToRun = ["assembleInternalDebug", "detekt", "unitTests", "allTests", "verifyScreenshotTests"];
  } else if (commentBody.startsWith("runChecks")) {
    if (commentBody.includes("compile")) {
      tasksToRun.push("assembleInternalDebug");
    }
    if (commentBody.includes("detekt")) {
      tasksToRun.push("detekt");
    }
    if (commentBody.includes("unitTests")) {
      tasksToRun.push("unitTests", "allTests");
    }
    if (commentBody.includes("screenshots")) {
      tasksToRun.push("verifyScreenshotTests");
    }
  }

  // Ensure compatibility of tasks
  if (tasksToRun.includes("unitTests") || tasksToRun.includes("allTests")) {
    compatibleTasks.push(
      tasksToRun.filter(task => task !== "verifyScreenshotTests")
    );
  }
  if (tasksToRun.includes("verifyScreenshotTests")) {
    compatibleTasks.push(["verifyScreenshotTests"]);
  }

  console.log('Resolved Tasks\n', JSON.stringify(compatibleTasks));
  console.log('PR Data\n' + JSON.stringify(pr));
}

module.exports = {
  dispatchWorkflows,
};