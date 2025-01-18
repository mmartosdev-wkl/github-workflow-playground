const MarkdownReport = require('./markdownReport');

/**
 * Retrieves the commit SHA and date from the given reference.
 *
 * @param {Object} params
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {string} params.ref - The Git reference (e.g., a tag or branch).
 * @returns {Promise<{hash: string, date: string}>} - An object with the commit's hash and date.
 */
async function getCommitHashAndDateFromRef({ github, context, ref }) {
  const { data: commit } = await github.rest.repos.getCommit({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ref,
  });

  return {
    hash: commit.sha,
    date: commit.commit.author.date,
  };
}

/**
 * Finds the most recent version tag in the repository that matches a pattern `x.y.0`.
 *
 * @param {Object} params
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @returns {Promise<string>} - The tag name of the most recent matching release.
 */
async function getLastVersionTag({ github, context }) {
  const regex = /^\d+\.\d+\.0$/;

  const releases = await github.paginate(
    github.rest.repos.listReleases,
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
    },
    (response, done) => {
      // Stop paginating once we find a matching release (non-draft).
      if (response.data.some((release) => regex.test(release.tag_name) && !release.draft)) {
        done();
      }
      return response.data;
    }
  );

  // Because releases are returned in descending order, .find() will pick
  // the first match from the top of the list, effectively giving us the
  // most recent.
  const lastRelease = releases.find((release) => regex.test(release.tag_name) && !release.draft);

  if (!lastRelease) {
    throw new Error("Couldn't identify last release");
  }
  return lastRelease.tag_name;
}

/**
 * Retrieves the ID of the first draft release, if any.
 *
 * @param {Object} params
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @returns {Promise<number|undefined>} - The draft release ID or `undefined` if none found.
 */
async function getReleaseDraftId({ github, context }) {
  const releases = await github.paginate(
    github.rest.repos.listReleases,
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
    },
    (response, done) => {
      if (response.data.some((release) => release.draft)) {
        done();
      }
      return response.data;
    }
  );

  const draftRelease = releases.find((release) => release.draft);
  return draftRelease ? draftRelease.id : undefined;
}

/**
 * Retrieves the commit SHAs for all commits between two specified version SHAs.
 *
 * @param {Object} params
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {string} params.lastVersionHash - The SHA of the older version/tag.
 * @param {string} params.currentVersionHash - The SHA of the newer version/branch.
 * @returns {Promise<string[]>} - An array of commit SHAs.
 */
async function getCommitHashesFromVersionTags({ github, context, lastVersionHash, currentVersionHash }) {
  // compareCommitsWithBasehead is not inherently paginated, so we can call it directly.
  const compareResponse = await github.rest.repos.compareCommitsWithBasehead({
    owner: context.repo.owner,
    repo: context.repo.repo,
    basehead: `${lastVersionHash}...${currentVersionHash}`,
  });

  // The commits are in compareResponse.data.commits
  const { commits } = compareResponse.data;
  return commits.map((commit) => commit.sha);
}

/**
 * Retrieves merged pull requests based on an array of commit SHAs and after a specific date.
 *
 * NOTE: This approach filters PRs by creation date > lastVersionDate, then checks if they were merged
 * and included in our commit list. Keep in mind that a PR created before `lastVersionDate` but merged
 * afterward would not be captured by this filter. Adjust as needed for your use case.
 *
 * @param {Object} params
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {Object} params.lastVersionHashAndDate - Contains `hash` and `date` for the previous version.
 * @param {Object} params.currentVersionHashAndDate - Contains `hash` and `date` for the current version (unused here but included for extension).
 * @param {string[]} params.commitHashes - An array of commit SHAs between the old and new versions.
 * @param {string} params.baseRef - The reference branch to which PRs were merged.
 * @returns {Promise<Object[]>} - An array of pull request objects.
 */
async function getMergedPullRequestsFromCommitHashes({
  github,
  context,
  lastVersionHashAndDate,
  currentVersionHashAndDate, // not currently used
  commitHashes,
  baseRef,
}) {
  const lastVersionDate = new Date(lastVersionHashAndDate.date);

  const pullRequests = await github.paginate(
    github.rest.pulls.list,
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
      state: 'closed',
      // Optionally, we can add 'per_page: 100' or similar for fewer calls if needed
    },
    (response, done) => {
      // Filter out PRs that were created before the last release date.
      const filtered = response.data.filter((pullRequest) => new Date(pullRequest.created_at) > lastVersionDate);
      if (filtered.length === 0) {
        // If this page has no relevant PRs, we can assume subsequent pages won't either
        // if the data is sorted from newest to oldest. (Though this assumption depends on sorting.)
        done();
      }
      return filtered;
    }
  );

  // Return only those PRs that are merged, have a head SHA in our commit list,
  // and target the specified baseRef.
  return pullRequests.filter(
    (pr) => pr.merged_at !== null && pr.head?.sha && commitHashes.includes(pr.head.sha) && pr.base.ref === baseRef
  );
}

/**
 * Utility to build a Markdown release body from a list of pull requests.
 * @param {string} versionLabel - Version label (e.g., "Version 1.2.3")
 * @param {Object[]} pullRequests - Array of PR objects.
 * @param {string} repoUrl - Repository URL.
 * @param {string} fromHash - The older commit SHA.
 * @param {string} toHash - The newer commit SHA.
 * @returns {string} - The assembled Markdown body.
 */
function buildReleaseBody(versionLabel, pullRequests, repoUrl, fromHash, toHash) {
  const report = new MarkdownReport(versionLabel);
  report.addSection("What's Changed");
  report.addList(
    pullRequests.map((pr) => `${pr.title} by @${pr.user.login} #${pr.number}`)
  );
  report.addText(`Full changelog: ${repoUrl}/compare/${fromHash}...${toHash}`);
  return report.generate();
}

/**
 * Creates or updates a draft release with the specified tag name, pulling changes from the last known version.
 *
 * @param {Object} params
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {string} params.tagName - The new release tag name to create or update.
 * @param {boolean} params.isDraft - Indicates if the release should remain a draft.
 * @returns {Promise<void>}
 */
async function createRelease({ github, context, tagName, isDraft }) {
  try {
    // Find the previous release that matches something like x.y.0
    const lastVersionTag = await getLastVersionTag({ github, context });

    // Retrieve commit/date info for the last version and the current dev branch
    const lastVersionHashAndDate = await getCommitHashAndDateFromRef({
      github,
      context,
      ref: `refs/tags/${lastVersionTag}`,
    });
    const currentVersionHashAndDate = await getCommitHashAndDateFromRef({
      github,
      context,
      ref: 'refs/heads/dev',
    });

    // Retrieve commits between the two versions
    const commitHashes = await getCommitHashesFromVersionTags({
      github,
      context,
      lastVersionHash: lastVersionHashAndDate.hash,
      currentVersionHash: currentVersionHashAndDate.hash,
    });

    // Get the merged PRs that match these commits
    const pullRequests = await getMergedPullRequestsFromCommitHashes({
      github,
      context,
      lastVersionHashAndDate,
      currentVersionHashAndDate,
      commitHashes,
      baseRef: 'dev',
    });

    // Build the release body markdown
    const body = buildReleaseBody(
      `Version ${tagName}`,
      pullRequests,
      context.payload.repository.html_url,
      lastVersionHashAndDate.hash,
      currentVersionHashAndDate.hash
    );

    // Check for an existing draft release
    const releaseDraftId = await getReleaseDraftId({ github, context });

    if (releaseDraftId !== undefined) {
      // Update the existing draft release
      await github.rest.repos.updateRelease({
        owner: context.repo.owner,
        repo: context.repo.repo,
        release_id: releaseDraftId,
        tag_name: tagName,
        name: tagName,
        body,
        draft: isDraft,
      });
    } else {
      // Create a new draft release
      await github.rest.repos.createRelease({
        owner: context.repo.owner,
        repo: context.repo.repo,
        tag_name: tagName,
        name: tagName,
        body,
        draft: isDraft,
      });
    }
  } catch (error) {
    throw error;
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
 * @param {Object} params
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {string} params.tagName - The new release tag name.
 * @param {string} params.oldTagName - The old release tag name to compare against.
 * @returns {Promise<void>}
 */
async function publishRelease({ github, context, tagName, oldTagName }) {
  try {
    // Construct the base ref from the new tag by removing the patch (e.g. "1.2.3" -> "release_1.2")
    const baseRef = `release_${removePatch(tagName)}`;

    // Get hash/date from the old tag and from the new base ref
    const lastVersionHashAndDate = await getCommitHashAndDateFromRef({
      github,
      context,
      ref: `refs/tags/${oldTagName}`,
    });
    const currentVersionHashAndDate = await getCommitHashAndDateFromRef({
      github,
      context,
      ref: `refs/heads/${baseRef}`,
    });

    // Retrieve the commits between those two points
    const commitHashes = await getCommitHashesFromVersionTags({
      github,
      context,
      lastVersionHash: lastVersionHashAndDate.hash,
      currentVersionHash: currentVersionHashAndDate.hash,
    });

    // Retrieve the relevant merged PRs
    const pullRequests = await getMergedPullRequestsFromCommitHashes({
      github,
      context,
      lastVersionHashAndDate,
      currentVersionHashAndDate,
      commitHashes,
      baseRef,
    });

    // Build the release body
    const body = buildReleaseBody(
      `Version ${tagName}`,
      pullRequests,
      context.payload.repository.html_url,
      lastVersionHashAndDate.hash,
      currentVersionHashAndDate.hash
    );

    // Create a new release (published, not a draft)
    await github.rest.repos.createRelease({
      owner: context.repo.owner,
      repo: context.repo.repo,
      tag_name: tagName,
      name: tagName,
      body,
      draft: false,
    });
  } catch (error) {
    throw error;
  }
}

module.exports = {
  createRelease,
  publishRelease,
};
