async function getCommitHashFromRef(
    github,
    context,
    ref
) {
    const { data: commit } = await github.rest.repos.getCommit({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: ref,
    });
    return commit.sha;
}

module.exports = {
    getCommitHashFromRef: getCommitHashFromRef
};