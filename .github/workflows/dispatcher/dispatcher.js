async function dispatchWorkflows({ github, context, commentId, commentBody }) {
  // Remove comment
  await github.rest.issues.deleteComment({
    owner: owner,
    repo: repo,
    comment_id: commentId,
  });
}

module.exports = {
  dispatchWorkflows,
};
