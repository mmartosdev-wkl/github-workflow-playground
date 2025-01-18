const MarkdownReport = require('./markdownReport');

async function getCommitHashAndDateFromRef(params) {
    const { data: commit } = await params.github.rest.repos.getCommit({
        owner: params.context.repo.owner,
        repo: params.context.repo.repo,
        ref: params.ref,
    });
    return { 
        hash: commit.sha,
        date: commit.commit.author.date,
    };
}

async function getLastVersionTag(params) {
    const regex = /^\d+\.\d+\.0$/;

    // Retrieve releases till any release matches with the regex
    const releases = await params.github.paginate(
        params.github.rest.repos.listReleases,
        {
            owner: params.context.repo.owner,
            repo: params.context.repo.repo,
        },
        (response, done) => {
            if (response.data.some(release => release.tag_name.match(regex) !== null && !release.draft)) {
                done();
            }
            return response.data;
        }
    );

    // Look for the release that matches with the regex
    const lastRelease = releases.find(release => release.tag_name.match(regex) !== null && !release.draft);

    // Return success or reject
    if (lastRelease !== undefined) {
        return lastRelease.tag_name;    
    } else {
        return Promise.reject(new Error("Couldn't identify last relase"));
    }
}

async function getReleaseDraftId(params) {
    // Retrieve releases till any release matches with the regex
    const releases = await params.github.paginate(
        params.github.rest.repos.listReleases,
        {
            owner: params.context.repo.owner,
            repo: params.context.repo.repo,
        },
        (response, done) => {
            const t = response.data.some(release => release.draft);
            console.log(t);
            if (response.data.some(release => console.log(release))) {
                done();
            }
            return response.data;
        }
    );

    // Look for the release that matches with the regex
    const lastRelease = releases.find(release => release.tag_name === params.tagName && release.draft);

    return (lastRelease !== undefined) ? lastRelease.id : undefined;
}


async function getCommitHashesFromVersionTags(params) {
    const compare = await params.github.paginate(
        params.github.rest.repos.compareCommitsWithBasehead,
        {
            owner: params.context.repo.owner,
            repo: params.context.repo.repo,
            basehead: `${params.lastVersionHash}...${params.currentVersionHash}`,
        },
    );
    return compare[0].commits.map(commit => commit.sha);
}

async function getMergedPullRequestsFromCommitHashes(params) {
    const lastVersionDate = new Date(params.lastVersionHashAndDate.date);
    const pullRequests = await params.github.paginate(
        params.github.rest.pulls.list,
        {
            owner: params.context.repo.owner,
            repo: params.context.repo.repo,
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
    return pullRequests.filter(pullRequest => pullRequest.merged_at !== null && pullRequest.head.sha !== null && params.commitHashes.includes(pullRequest.head.sha));
}

async function createReleaseDraft(params) {
    try {
        // Look for previous release cut
        const lastVersionTag = await getLastVersionTag({
            github: params.github,
            context: params.context,
        });

        // Get hash and date from current head and last version tag
        const lastVersionHashAndDate = await getCommitHashAndDateFromRef({
            github: params.github,
            context: params.context,
            ref: `refs/tags/${lastVersionTag}`,
        });
        const currentVersionHashAndDate = await getCommitHashAndDateFromRef({
            github: params.github,
            context: params.context,
            ref: 'refs/heads/dev',
        });

        // Retrieve all commits between the two versions
        const commitHashes = await getCommitHashesFromVersionTags({
            github: params.github,
            context: params.context,
            lastVersionHash: lastVersionHashAndDate.hash,
            currentVersionHash: currentVersionHashAndDate.hash,
        });

        // Retrieve all merged pull requests that took place in between the commits we've identified
        const pullRequests = await getMergedPullRequestsFromCommitHashes({
            github: params.github,
            context: params.context,
            lastVersionHashAndDate: lastVersionHashAndDate,
            currentVersionHashAndDate: currentVersionHashAndDate,
            commitHashes: commitHashes,
        });

        // Create report
        const report = new MarkdownReport(`Version ${params.tagName}`);
        report.addSection('What\'s Changed');
        report.addList(pullRequests.map(pullRequest => `${pullRequest.title} by @${pullRequest.user.login} #${pullRequest.number}`));
        report.addText(`Full changelog: ${params.context.payload.repository.html_url}/compare/${lastVersionHashAndDate.hash}...${currentVersionHashAndDate.hash}`);

        // Get release draft id
        const releaseDraftId = await getReleaseDraftId({
            github: params.github,
            context: params.context,
        });

        // Update or create a new release draft
        if (releaseDraftId !== undefined) {
            await params.github.rest.repos.updateRelease({
                owner: params.context.repo.owner,
                repo: params.context.repo.repo,
                release_id: releaseDraftId,
                tag_name: params.tagName,
                name: params.tagName,
                body: report.generate(),
                draft: true,
            });
        } else {
            await params.github.rest.repos.createRelease({
                owner: params.context.repo.owner,
                repo: params.context.repo.repo,
                tag_name: params.tagName,
                name: params.tagName,
                body: report.generate(),
                draft: true,
            });
        }
    } catch (error) {
        return Promise.reject(error);
    }
}

async function publishReleaseDraft(params) {
    try {
        // Get release draft id
        const releaseDraftId = await getReleaseDraftId({
            github: params.github,
            context: params.context,
        });
        console.log("releaseDraftId -> " + releaseDraftId)

        // Publish the release draft
        if (releaseDraftId !== undefined) {
            await params.github.rest.repos.updateRelease({
                owner: params.context.repo.owner,
                repo: params.context.repo.repo,
                release_id: releaseDraftId,
                tag_name: params.tagName,
                draft: false,
            });
        }
    } catch (error) {
        return Promise.reject(error);
    }
}

module.exports = {
    createReleaseDraft: createReleaseDraft,
    publishReleaseDraft: publishReleaseDraft,
};