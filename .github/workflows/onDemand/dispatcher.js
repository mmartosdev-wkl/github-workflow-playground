// Function to delete a comment
async function deleteComment(github, owner, repo, commentId) {
  await github.rest.issues.deleteComment({
    owner: owner,
    repo: repo,
    comment_id: commentId,
  });
}

// Function to fetch PR data
async function fetchPRData(github, owner, repo, prNumber) {
  const { data: pr } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  return pr;
}

// Function to resolve tasks based on commentBody
function resolveTasks(commentBody) {
  let tasksToRun = [];

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

  return tasksToRun;
}

// Function to ensure compatibility of tasks
function ensureCompatibleTasks(tasksToRun) {
  let compatibleTasks = [];
  if (tasksToRun.includes("unitTests") || tasksToRun.includes("allTests")) {
    compatibleTasks.push(
      tasksToRun.filter(task => task !== "verifyScreenshotTests")
    );
    compatibleTasks.push(["verifyScreenshotTests"]);
  } else {
    compatibleTasks.push(tasksToRun);
  }
  return compatibleTasks;
}

// Main function dispatchWorkflows
async function dispatchWorkflows({ github, context, commentId, commentBody }) {
  const { owner, repo } = context.repo;

  // Step 1: Remove comment
  await deleteComment(github, owner, repo, commentId);

  // Step 2: Fetch PR data
  const prNumber = context.issue.number;
  const pr = await fetchPRData(github, owner, repo, prNumber);

  // Step 3: Resolve tasks
  const tasksToRun = resolveTasks(commentBody);

  // Step 4: Ensure task compatibility
  const compatibleTasks = ensureCompatibleTasks(tasksToRun);

  console.log(`compatibleTasks: ${JSON.stringify(compatibleTasks)}`);

   // Step 5: Dispatch workflows
   await github.rest.actions.createWorkflowDispatch({
     owner: owner,
     repo:  repo,
     /** file name *or* numeric ID that you see in the URL on the
         Actions → “...” menu (e.g. `161335`) */
     workflow_id: "163865713",
     /** branch, tag, or full SHA that the called workflow should run on */
     ref: pr.head.ref,
     /* optional, declared in the target workflow’s `on: workflow_dispatch: inputs:` */
     inputs: {
       tasks: JSON.stringify(compatibleTasks),
     }
   });
}

module.exports = {
  dispatchWorkflows,
};
