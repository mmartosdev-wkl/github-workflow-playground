async function dispatchWorkflows({ github, context, commentId, commentBody }) {
  const { owner, repo } = context.repo;

  // Remove comment
  await github.rest.issues.deleteComment({
    owner: owner,
    repo: repo,
    comment_id: commentId,
  });

  // Get data relative to PR where the comment has been added
  const prNumber = context.issue.number;
  const { data: pr } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber
  });

  console.log('PR Data\n' + JSON.stringify(pr));
}

module.exports = {
  dispatchWorkflows,
};