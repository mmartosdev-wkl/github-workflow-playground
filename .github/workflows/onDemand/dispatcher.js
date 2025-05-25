const { resolveTasks, categorizeTasks } = require('./taskCategorization');

// Function to delete a comment
async function deleteComment(github, owner, repo, commentId) {
  await github.rest.issues.deleteComment({
    owner: owner,
    repo: repo,
    comment_id: commentId,
  });
}

// Function to fetch Pull Request data
async function fetchPullRequestData(github, owner, repo, prNumber) {
  const { data: pr } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  return pr;
}

// Main function dispatchWorkflows
async function dispatchWorkflows({ github, context, commentId, commentBody }) {
  const { owner, repo } = context.repo;

  // Step 1: Remove comment
  await deleteComment(github, owner, repo, commentId);

  // Step 2: Fetch PR data
  const prNumber = context.issue.number;
  const pr = await fetchPullRequestData(github, owner, repo, prNumber);

  // Step 3: Resolve and categorize tasks
  const tasksToRun = resolveTasks(commentBody);
  const categorizeTasks = categorizeTasks(tasksToRun);

  // Step 4: Dispatch checks tasks
  if (categorizeTasks.checkTasks.length > 0) {
    await github.rest.actions.createWorkflowDispatch({
      owner: owner,
      repo:  repo,
      workflow_id: "checkWorkflow.yml",
      ref: pr.head.ref,
      inputs: {
        gradle_tasks: JSON.stringify(categorizeTasks.checkTasks),
      }
    });
  }

  // Step 5: Dispatch commit tasks
  if (categorizeTasks.commitTasks.length > 0) {
    await github.rest.actions.createWorkflowDispatch({
      owner: owner,
      repo:  repo,
      workflow_id: "commitWorkflow.yml",
      ref: pr.head.ref,
      inputs: {
        gradle_tasks: JSON.stringify(categorizeTasks.commitTasks),
      }
    });
  }
}

module.exports = {
  dispatchWorkflows,
};
