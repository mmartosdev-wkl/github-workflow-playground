/**
 * External dependency for generating a Markdown report.
 */
const MarkdownReport = require('./markdownReport');

/**
 * Retrieves the commit SHA and date from the given reference.
 * 
 * @param {Object} params - Parameters object containing `github` and `context`.
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {string} params.ref - The Git reference (e.g., a tag or branch).
 * @returns {Promise<{hash: string, date: string}>} - An object with the commit's hash and date.
 */
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

/**
 * Finds the most recent version tag in the repository that matches a pattern `x.y.0`.
 * 
 * @param {Object} params - Parameters object containing `github` and `context`.
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @returns {Promise<string>} - The tag name of the most recent matching release.
 */
async function getLastVersionTag(params) {
  const regex = /^\d+\.\d+\.0$/;

  // Retrieve releases via pagination until a matching release is found.
  const releases = await params.github.paginate(
    params.github.rest.repos.listReleases,
    {
      owner: params.context.repo.owner,
      repo: params.context.repo.repo,
    },
    (response, done) => {
      if (
        response.data.some(
          (release) => release.tag_name.match(regex) !== null && !release.draft
        )
      ) {
        done();
      }
      return response.data;
    }
  );

  // Find a release that matches the regex and is not a draft.
  const lastRelease = releases.find(
    (release) => release.tag_name.match(regex) !== null && !release.draft
  );

  if (lastRelease !== undefined) {
    return lastRelease.tag_name;
  } else {
    return Promise.reject(new Error("Couldn't identify last release"));
  }
}

/**
 * Retrieves the ID of the first draft release, if any.
 * 
 * @param {Object} params - Parameters object containing `github` and `context`.
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @returns {Promise<number|undefined>} - The draft release ID or `undefined` if none found.
 */
async function getReleaseDraftId(params) {
  // Look for the first release that is marked as a draft.
  const releases = await params.github.paginate(
    params.github.rest.repos.listReleases,
    {
      owner: params.context.repo.owner,
      repo: params.context.repo.repo,
    },
    (response, done) => {
      if (response.data.some((release) => release.draft)) {
        done();
      }
      return response.data;
    }
  );

  const lastRelease = releases.find((release) => release.draft);
  return lastRelease !== undefined ? lastRelease.id : undefined;
}

/**
 * Retrieves the commit SHAs for all commits between two specified version SHAs.
 * 
 * @param {Object} params - Parameters object containing `github`, `context`, `lastVersionHash`, and `currentVersionHash`.
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {string} params.lastVersionHash - The SHA of the older version/tag.
 * @param {string} params.currentVersionHash - The SHA of the newer version/branch.
 * @returns {Promise<string[]>} - An array of commit SHAs.
 */
async function getCommitHashesFromVersionTags(params) {
  const compare = await params.github.paginate(
    params.github.rest.repos.compareCommitsWithBasehead,
    {
      owner: params.context.repo.owner,
      repo: params.context.repo.repo,
      basehead: `${params.lastVersionHash}...${params.currentVersionHash}`,
    }
  );
  // compare[0].commits is the list of commits in the comparison.
  return compare[0].commits.map((commit) => commit.sha);
}

/**
 * Retrieves merged pull requests based on an array of commit SHAs and after a specific date.
 * 
 * @param {Object} params - Parameters object containing `github`, `context`, `lastVersionHashAndDate`, `commitHashes`, and `baseRef`.
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {Object} params.lastVersionHashAndDate - Contains `hash` and `date` for the previous version.
 * @param {Object} params.currentVersionHashAndDate - Contains `hash` and `date` for the current version (not used here but included for potential extension).
 * @param {string[]} params.commitHashes - An array of commit SHAs between the old and new versions.
 * @param {string} params.baseRef - The reference branch to which PRs were merged.
 * @returns {Promise<Object[]>} - An array of pull request objects.
 */
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
      // Filter out PRs that were created before the last release date.
      const filteredData = response.data.filter(
        (pullRequest) => new Date(pullRequest.created_at) > lastVersionDate
      );
      if (filteredData.length === 0) {
        done();
      }
      return filteredData;
    }
  );

  // Return only those PRs that are merged, have a head SHA in our commit list, and target the specified baseRef.
  return pullRequests.filter(
    (pullRequest) =>
      pullRequest.merged_at !== null &&
      pullRequest.head.sha !== null &&
      params.commitHashes.includes(pullRequest.head.sha) &&
      pullRequest.base.ref === params.baseRef
  );
}

/**
 * Creates or updates a draft release with the specified tag name, pulling changes from the last known version.
 * 
 * @param {Object} params - Parameters object containing `github`, `context`, and `tagName`.
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {string} params.tagName - The new release tag name to create or update.
 * @param {boolean} params.draft - Indicates if the release should remain a draft.
 * @returns {Promise<void>}
 */
async function createRelease(params) {
  try {
    // Find the previous release with a tag like x.y.0.
    const lastVersionTag = await getLastVersionTag({
      github: params.github,
      context: params.context,
    });

    // Get hash and date from both the last version tag and the current dev branch.
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

    // Retrieve all commits between the two versions.
    const commitHashes = await getCommitHashesFromVersionTags({
      github: params.github,
      context: params.context,
      lastVersionHash: lastVersionHashAndDate.hash,
      currentVersionHash: currentVersionHashAndDate.hash,
    });

    // Retrieve all merged pull requests in that commit range.
    const pullRequests = await getMergedPullRequestsFromCommitHashes({
      github: params.github,
      context: params.context,
      lastVersionHashAndDate,
      currentVersionHashAndDate,
      commitHashes,
      baseRef: 'dev',
    });

    // Build the Markdown release body.
    const report = new MarkdownReport(`Version ${params.tagName}`);
    report.addSection('What\'s Changed');
    report.addList(
      pullRequests.map(
        (pullRequest) =>
          `${pullRequest.title} by @${pullRequest.user.login} #${pullRequest.number}`
      )
    );
    report.addText(
      `Full changelog: ${params.context.payload.repository.html_url}/compare/${lastVersionHashAndDate.hash}...${currentVersionHashAndDate.hash}`
    );

    // Check if there's an existing draft release.
    const releaseDraftId = await getReleaseDraftId({
      github: params.github,
      context: params.context,
    });

    // Update the existing draft release or create a new one.
    if (releaseDraftId !== undefined) {
      await params.github.rest.repos.updateRelease({
        owner: params.context.repo.owner,
        repo: params.context.repo.repo,
        release_id: releaseDraftId,
        tag_name: params.tagName,
        name: params.tagName,
        body: report.generate(),
        draft: params.draft,
      });
    } else {
      await params.github.rest.repos.createRelease({
        owner: params.context.repo.owner,
        repo: params.context.repo.repo,
        tag_name: params.tagName,
        name: params.tagName,
        body: report.generate(),
        draft: params.draft,
      });
    }
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Removes the patch number from a version tag, e.g., "1.2.3" -> "1.2".
 * 
 * @param {string} versionTag - The full version tag, e.g. "1.2.3".
 * @returns {string} - The version without the patch number, e.g. "1.2".
 * @throws {Error} If the tag is invalid.
 */
function removePatch(versionTag) {
  const parts = versionTag.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid version tag');
  }
  return `${parts[0]}.${parts[1]}`;
}

/**
 * Publishes a final release by generating a changelog based on merged pull requests
 * between two tags. It creates a new release (not a draft).
 * 
 * @param {Object} params - Parameters object containing `github`, `context`, `tagName`, and `oldTagName`.
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {string} params.tagName - The new release tag name.
 * @param {string} params.oldTagName - The old release tag name to compare against.
 * @returns {Promise<void>}
 */
async function publishRelease(params) {
  try {
    // Construct the base ref from the new tag by removing the patch part (e.g., "1.2.3" -> "release_1.2").
    const baseRef = `release_${removePatch(params.tagName)}`;

    // Get hash and date for the old tag and the new base ref branch.
    const lastVersionHashAndDate = await getCommitHashAndDateFromRef({
      github: params.github,
      context: params.context,
      ref: `refs/tags/${params.oldTagName}`,
    });
    const currentVersionHashAndDate = await getCommitHashAndDateFromRef({
      github: params.github,
      context: params.context,
      ref: `refs/heads/${baseRef}`,
    });

    // Retrieve the commits between the old and new versions.
    const commitHashes = await getCommitHashesFromVersionTags({
      github: params.github,
      context: params.context,
      lastVersionHash: lastVersionHashAndDate.hash,
      currentVersionHash: currentVersionHashAndDate.hash,
    });

    // Retrieve merged pull requests relevant to those commits.
    const pullRequests = await getMergedPullRequestsFromCommitHashes({
      github: params.github,
      context: params.context,
      lastVersionHashAndDate,
      currentVersionHashAndDate,
      commitHashes,
      baseRef,
    });

    // Build the Markdown release body.
    const report = new MarkdownReport(`Version ${params.tagName}`);
    report.addSection('What\'s Changed');
    report.addList(
      pullRequests.map(
        (pullRequest) =>
          `${pullRequest.title} by @${pullRequest.user.login} #${pullRequest.number}`
      )
    );
    report.addText(
      `Full changelog: ${params.context.payload.repository.html_url}/compare/${lastVersionHashAndDate.hash}...${currentVersionHashAndDate.hash}`
    );

    // Create a new release (publish it, not as a draft).
    await params.github.rest.repos.createRelease({
      owner: params.context.repo.owner,
      repo: params.context.repo.repo,
      tag_name: params.tagName,
      name: params.tagName,
      body: report.generate(),
      draft: false,
    });
  } catch (error) {
    return Promise.reject(error);
  }
}

module.exports = {
  createRelease,
  publishRelease,
};
