/**
 * Checkout these as a reference of the APIs used in this code:
 *   - Github Rest API: https://octokit.github.io/rest.js/v21/
 *   - Paginate API: https://github.com/octokit/plugin-paginate-rest.js
 * Maybe this could potentially become a proper github action published by Wikiloc Tech
 */

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
  console.log(`--> getCommitHashAndDateFromRef: ref -> ${ref}`);
  const { data: commit } = await github.rest.repos.getCommit({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ref,
  });

  const result = {
    hash: commit.sha,
    date: commit.commit.author.date,
  };
  console.log(`<-- getCommitHashAndDateFromRef -> ${result}`);
  return result;
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
  console.log(`--> getLastVersionTag`);
  const regex = /^\d+\.\d+\.0$/;

  const releases = await github.paginate(
    github.rest.repos.listReleases,
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
    },
    (response, done) => {
      // Stop paginating once we find a matching non-draft release.
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
    console.log(`<-- getLastVersionTag -> Couldn't identify last release`);
    throw new Error("Couldn't identify last release");
  }
  console.log(`<-- getLastVersionTag -> ${lastRelease.tag_name}`);
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
  console.log(`--> getReleaseDraftId`);
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
  const result = draftRelease ? draftRelease.id : undefined;
  console.log(`<-- getReleaseDraftId -> ${result}`);
  return result;
}

/**
 * Escapes any special characters in a string to make it safe for use in a regular expression.
 * 
 * @param {string} str - The input string to be escaped.
 * @returns {string} - The escaped string, safe for use in a regular expression.
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Retrieves the most recent release tag name matching a specific base tag format.
 * 
 * @param {Object} params - Parameters for the function.
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {string} params.tagNameWithoutPatch - The base tag name without the patch version to match against.
 * @returns {Promise<string|null>} - The name of the last matching release tag, or null if no match is found.
 */
async function getLastReleaseTagName({ github, context, tagNameWithoutPatch }) {
  console.log(`<-- getLastReleaseTagName -> ${tagNameWithoutPatch}`);
  const escapedBaseTag = escapeRegExp(tagNameWithoutPatch);
  const regex = new RegExp(`^${escapedBaseTag}\\.\\d+$`);
  
  // Retrieve all releases from the GitHub repository and filter them based on the regex.
  const releases = await github.paginate(
    github.rest.repos.listReleases,
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
    },
    (response, done) => {
      const filteredReleases = response.data.filter(release => regex.test(release.tag_name));
      if (filteredReleases.length === 0) {
        done(); // Stop pagination if no matching releases are found.
      }
      return filteredReleases;
    }
  );

  if (!releases.length) {
    console.log("<-- getLastReleaseTagName -> no matching release found");
    return null; 
  }

  const lastTagName = releases[0].tag_name;
  console.log(`<-- getLastReleaseTagName -> ${lastTagName}`);
  return lastTagName;
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
  console.log(`--> getCommitHashesFromVersionTags`);
  const compareResponse = await github.rest.repos.compareCommitsWithBasehead({
    owner: context.repo.owner,
    repo: context.repo.repo,
    basehead: `${lastVersionHash}...${currentVersionHash}`,
  });

  const { commits } = compareResponse.data;
  console.log(`<-- getCommitHashesFromVersionTags`);
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
 * @param {string[]} params.commitHashes - An array of commit SHAs between the old and new versions.
 * @param {string} params.baseRef - The reference branch to which PRs were merged.
 * @returns {Promise<Object[]>} - An array of pull request objects.
 */
async function getMergedPullRequestsFromCommitHashes({
  github,
  context,
  lastVersionHashAndDate,
  commitHashes,
  baseRef,
}) {
  console.log(`--> getMergedPullRequestsFromCommitHashes`);
  const lastVersionDate = new Date(lastVersionHashAndDate.date);

  const pullRequests = await github.paginate(
    github.rest.pulls.list,
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
      state: 'closed',
      // optionally: per_page: 100
    },
    (response, done) => {
      // Filter out PRs that were created before the last release date.
      const filtered = response.data.filter(
        (pullRequest) => new Date(pullRequest.created_at) > lastVersionDate
      );
      if (filtered.length === 0) {
        // If this page has no relevant PRs, we can assume subsequent pages won't either
        // if the data is sorted from newest to oldest.
        done();
      }
      return filtered;
    }
  );

  // Only return PRs that:
  //  - are merged (pr.merged_at !== null)
  //  - have a head SHA in our commit list
  //  - target the specified baseRef.
  console.log(`<-- getMergedPullRequestsFromCommitHashes`);
  return pullRequests.filter(
    (pr) =>
      pr.merged_at !== null &&
      pr.head?.sha &&
      commitHashes.includes(pr.head.sha) &&
      pr.base.ref === baseRef
  );
}

/**
 * Classifies pull requests by matching label names.
 *
 * @param {Object[]} pullRequests - An array of pull request objects.
 * @param {string[]} labels - Array of label names to classify.
 * @returns {Object} - An object with keys for each label plus "remaining" for unmatched PRs.
 */
function classifyPullRequestByLabels(pullRequests, labels) {
  console.log(`--> classifyPullRequestByLabels`);
  const classified = {};
  labels.forEach((label) => {
    classified[label] = [];
  });
  classified.remaining = [];

  pullRequests.forEach((pr) => {
    // GitHub PR labels are objects with a 'name' property, not raw strings
    const labelNames = pr.labels.map((labelObj) => labelObj.name);
    let isLabeled = false;

    labels.forEach((label) => {
      if (labelNames.includes(label)) {
        classified[label].push(pr);
        isLabeled = true;
      }
    });

    if (!isLabeled) {
      classified.remaining.push(pr);
    }
  });

  console.log(`<-- classifyPullRequestByLabels`);
  return classified;
}

/**
 * Builds a Markdown release body from classified pull requests.
 *
 * @param {string} versionLabel - Version label (e.g., "Version 1.2.3").
 * @param {Object[]} pullRequests - Array of PR objects.
 * @param {string} repoUrl - Repository HTML URL.
 * @param {string} fromHash - Older commit SHA.
 * @param {string} toHash - Newer commit SHA.
 * @returns {string} - A Markdown-formatted release body.
 */
function buildReleaseBody(versionLabel, pullRequests, repoUrl, fromHash, toHash) {
  console.log(`--> buildReleaseBody`);
  const report = new MarkdownReport(versionLabel);

  // Example categories you can tweak as needed
  const labelCategories = ['bug', 'feature', 'refactor', 'ci'];
  const classifiedPullRequests = classifyPullRequestByLabels(pullRequests, labelCategories);

  // 1. Remaining
  if (classifiedPullRequests.remaining.length !== 0) {
    report.addSection("What's Changed");
    report.addList(
      classifiedPullRequests.remaining.map(
        (pr) => `${pr.title} by @${pr.user.login} in #${pr.number}`
      )
    );
  }

  // 2. Bugs
  if (classifiedPullRequests.bug.length !== 0) {
    report.addSection('🐛 Bug Fixes');
    report.addList(
      classifiedPullRequests.bug.map(
        (pr) => `${pr.title} by @${pr.user.login} in #${pr.number}`
      )
    );
  }

  // 3. Features
  if (classifiedPullRequests.feature.length !== 0) {
    report.addSection('🚀 Features');
    report.addList(
      classifiedPullRequests.feature.map(
        (pr) => `${pr.title} by @${pr.user.login} in #${pr.number}`
      )
    );
  }

  // 4. Refactors
  if (classifiedPullRequests.refactor.length !== 0) {
    report.addSection('🧹 Refactor');
    report.addList(
      classifiedPullRequests.refactor.map(
        (pr) => `${pr.title} by @${pr.user.login} in #${pr.number}`
      )
    );
  }

  // 5. CI
  if (classifiedPullRequests.ci.length !== 0) {
    report.addSection('🤖 CI');
    report.addList(
      classifiedPullRequests.ci.map(
        (pr) => `${pr.title} by @${pr.user.login} in #${pr.number}`
      )
    );
  }

  // Full changelog link
  report.addText(`Full changelog: ${repoUrl}/compare/${fromHash}...${toHash}`);

  console.log(`<-- buildReleaseBody`);
  return report.generate();
}

/**
 * Internal helper to gather commits and pull requests between two references.
 * @param {Object} github - GitHub REST API object.
 * @param {Object} context - GitHub Actions context.
 * @param {string} fromRef - Reference for the older version/tag (e.g., `refs/tags/1.2.0`).
 * @param {string} toRef - Reference for the newer version/branch (e.g., `refs/heads/dev`).
 * @param {string} baseRef - The branch to which PRs were merged (e.g., `dev`).
 * @returns {Promise<{lastVersionHashAndDate: Object, commitHashes: string[], pullRequests: Object[]}>}
 */
async function gatherPullRequestsBetweenRefs(github, context, fromRef, toRef, baseRef) {
  console.log(`--> gatherPullRequestsBetweenRefs`);
  const lastVersionHashAndDate = await getCommitHashAndDateFromRef({
    github,
    context,
    ref: fromRef,
  });

  const currentVersionHashAndDate = await getCommitHashAndDateFromRef({
    github,
    context,
    ref: toRef,
  });

  const commitHashes = await getCommitHashesFromVersionTags({
    github,
    context,
    lastVersionHash: lastVersionHashAndDate.hash,
    currentVersionHash: currentVersionHashAndDate.hash,
  });

  const pullRequests = await getMergedPullRequestsFromCommitHashes({
    github,
    context,
    lastVersionHashAndDate,
    commitHashes,
    baseRef,
  });

  const result = {
    lastVersionHashAndDate,
    currentVersionHashAndDate,
    commitHashes,
    pullRequests,
  };
  console.log(`<-- gatherPullRequestsBetweenRefs -> ${result}`);
  return result;
}

/**
 * Creates or updates a draft release with the specified tag name,
 * pulling changes from the last known `x.y.0` version to `dev`.
 *
 * @param {Object} params
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {string} params.tagName - The new release tag name to create or update.
 * @param {boolean} params.isDraft - Indicates if the release should remain a draft.
 * @returns {Promise<void>}
 */
async function createRelease({ github, context, tagName, isDraft }) {
  // 1. Find last version tag that matches x.y.0
  console.log(`--> createRelease`);
  const lastVersionTag = await getLastVersionTag({ github, context });

  // 2. Gather commits and PRs from lastVersionTag -> dev
  const { lastVersionHashAndDate, currentVersionHashAndDate, pullRequests } =
    await gatherPullRequestsBetweenRefs(
      github,
      context,
      `refs/tags/${lastVersionTag}`,
      'refs/heads/dev',
      'dev'
    );

  // 3. Build the release body
  const body = buildReleaseBody(
    `Version ${tagName}`,
    pullRequests,
    context.payload.repository.html_url,
    lastVersionHashAndDate.hash,
    currentVersionHashAndDate.hash
  );

  // 4. Check if there’s an existing draft release
  const releaseDraftId = await getReleaseDraftId({ github, context });
  if (releaseDraftId !== undefined) {
    console.log(`tagName -> ${tagName}`);
    console.log(`isDraft -> ${isDraft}`);
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
  console.log(`<-- createRelease`);
}

/**
 * Removes the patch number from a version tag, e.g., "1.2.3" -> "1.2".
 *
 * @param {string} versionTag - The full version tag, e.g. "1.2.3".
 * @returns {string} - The version without the patch number, e.g. "1.2".
 * @throws {Error} If the tag is invalid.
 */
function removePatch(versionTag) {
  console.log(`--> removePatch`);
  const parts = versionTag.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid version tag');
  }
  const result = `${parts[0]}.${parts[1]}`;
  console.log(`--> removePatch -> ${result}`);
  return result;
}

/**
 * Publishes a final release by generating a changelog based on merged pull requests
 * between two tags. It creates a new release (not a draft).
 *
 * @param {Object} params
 * @param {Object} params.github - GitHub REST API object.
 * @param {Object} params.context - GitHub Actions context.
 * @param {string} params.tagName - The new release tag name.
 * @returns {Promise<void>}
 */
async function publishRelease({ github, context, tagName}) {
  console.log(`--> publishRelease`);

  // Construct a base ref from the new tag by removing the patch (e.g. "1.2.3" -> "release_1.2")
  const tagNameWithoutPatch = removePatch(tagName);
  const baseRef = `release_${tagNameWithoutPatch}`;

  const lastTagName = await getLastReleaseTagName({ github, context, tagNameWithoutPatch});

  // Gather commits/PRs from oldTagName -> baseRef
  const { lastVersionHashAndDate, currentVersionHashAndDate, pullRequests } =
    await gatherPullRequestsBetweenRefs(
      github,
      context,
      `refs/tags/${lastTagName}`,
      `refs/heads/${baseRef}`,
      baseRef
    );

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
  console.log(`<--> publishRelease`);
}

module.exports = {
  createRelease,
  publishRelease,
  buildReleaseBody,
};
