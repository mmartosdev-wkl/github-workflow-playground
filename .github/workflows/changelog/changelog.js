

async function getCommitHashFromRef(options) {
    const { data: commit } = await options.github.rest.repos.getCommit({
        owner: options.context.repo.owner,
        repo: options.context.repo.repo,
        ref: options.ref,
    });
    console.log(commit);
    return commit.sha;
}


async function getLastVersionTag(options) {
    const regex = /^\d+\.\d+\.0$/;

    // Retrieve releases till any release matches with the regex
    const releases = await options.github.paginate(
        options.github.rest.repos.listReleases,
        {
            owner: options.context.repo.owner,
            repo: options.context.repo.repo,
        },
        (response, done) => {
            console.log("paginate");
            if (response.data.some(release => release.tag_name.match(regex) !== null)) {
                done();
            }
            return response.data;
        }
    );

    // Look for the release that matches with the regex
    const lastRelease = releases.find(release => release.tag_name.match(regex) !== null);

    // Return success or reject
    if (lastRelease !== undefined) {
        return lastRelease.tag_name;    
    } else {
        return Promise.reject(new Error("Couldn't identify last relase"));
    }
}


/**
 * Input params:
 * options.github
 * options.context
 * options.tagName
 */
async function changelog(options) {
    try {
        // Look for previous release cut
        const lastVersionTag = await getLastVersionTag({
            github: options.github,
            context: options.context,
        });
        console.log(`Last version tag: ${lastVersionTag}`);

        // Get hash and date from current head and last version tag
        const lastVersionHash = await getCommitHashFromRef({
            github: options.github,
            context: options.context,
            ref: `refs/tags/${lastVersionTag}`,
        });
        const currentVersionHash = await getCommitHashFromRef({
            github: options.github,
            context: options.context,
            ref: 'refs/heads/dev',
        });
        console.log(`Last version tag: ${lastVersionHash}`);
        console.log(`Current version tag: ${currentVersionHash}`);


    } catch (error) {
        console.error("Error:", error.message);
    }
}


module.exports = {
    getCommitHashFromRef: getCommitHashFromRef,
    changelog: changelog,
};