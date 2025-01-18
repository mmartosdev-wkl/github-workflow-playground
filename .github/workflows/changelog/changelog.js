const MarkdownReport = require('./markdownReport');

async function getCommitHashFromRef(options) {
    const { data: commit } = await options.github.rest.repos.getCommit({
        owner: options.context.repo.owner,
        repo: options.context.repo.repo,
        ref: options.ref,
    });
    console.log(commit);
    return commit.sha;
}


async function getCommitHashAndDateFromRef(options) {
    const { data: commit } = await options.github.rest.repos.getCommit({
        owner: options.context.repo.owner,
        repo: options.context.repo.repo,
        ref: options.ref,
    });
    return { 
        hash: commit.sha,
        date: commit.commit.author.date,
    };
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

async function getCommitHashesFromVersionTags(options) {
    const compare = await options.github.paginate(
        options.github.rest.repos.compareCommitsWithBasehead,
        {
            owner: options.context.repo.owner,
            repo: options.context.repo.repo,
            basehead: `${options.lastVersionHash}...${options.currentVersionHash}`,
        },
    );
    return compare[0].commits.map(commit => commit.sha);
}

async function getMergedPullRequestsFromCommitHashes(options) {
    const lastVersionDate = new Date(options.lastVersionHashAndDate.date);
    const pullRequests = await options.github.paginate(
        options.github.rest.pulls.list,
        {
            owner: options.context.repo.owner,
            repo: options.context.repo.repo,
            state: 'closed',
        },
        (response, done) => {
            const filteredData = response.data.filter(pullRequest => new Date(pullRequest.created_at) > lastVersionDate);
            if (filteredData.length === 0) {
                done();
            }
            return filteredData;
        },
    );
    return pullRequests.filter(pullRequest => pullRequest.merged_at !== null && pullRequest.head.sha !== null && options.commitHashes.includes(pullRequest.head.sha));
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

        // Get hash and date from current head and last version tag
        const lastVersionHashAndDate = await getCommitHashAndDateFromRef({
            github: options.github,
            context: options.context,
            ref: `refs/tags/${lastVersionTag}`,
        });
        const currentVersionHashAndDate = await getCommitHashAndDateFromRef({
            github: options.github,
            context: options.context,
            ref: 'refs/heads/dev',
        });

        // Retrieve all commits between the two versions
        const commitHashes = await getCommitHashesFromVersionTags({
            github: options.github,
            context: options.context,
            lastVersionHash: lastVersionHashAndDate.hash,
            currentVersionHash: currentVersionHashAndDate.hash,
        });

        // Retrieve all merged pull requests that took place in between the commits we've identified
        const pullRequests = await getMergedPullRequestsFromCommitHashes({
            github: options.github,
            context: options.context,
            lastVersionHashAndDate: lastVersionHashAndDate,
            currentVersionHashAndDate: currentVersionHashAndDate,
            commitHashes: commitHashes,
        });

        console.log(options.context.repo.repo);
        
        // Create report
        const report = new MarkdownReport(`Version ${options.tagName}`);
        report.addSection('What\'s Changed');
        report.addList(pullRequests.map(pullRequest => `${pullRequest.title} by @${pullRequest.user.login} #${pullRequest.number}`));
        report.addText(`Full changelog: https://github.com/mmartosdev-wkl/github-workflow-playground/compare/${lastVersionHashAndDate.hash}...${currentVersionHashAndDate.hash}`);

        // Create release
        await options.github.rest.repos.createRelease({
            owner: options.context.repo.owner,
            repo: options.context.repo.repo,
            tag_name: options.tagName,
            name: options.tagName,
            body: report.generate(),
            draft: true,
        });
    } catch (error) {
        console.error("Error:", error.message);
        return Promise.reject(error);
    }
}


module.exports = {
    getCommitHashFromRef: getCommitHashFromRef,
    changelog: changelog,
};