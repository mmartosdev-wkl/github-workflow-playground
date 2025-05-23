async function dispatchWorkflows({ github, context, commentId, commentBody }) {
  // Remove comment
  await github.rest.issues.deleteComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    comment_id: commentId,
  });
}

module.exports = {
  dispatchWorkflows,
};
