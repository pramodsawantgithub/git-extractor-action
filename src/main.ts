import * as core from "@actions/core";
import * as github from "@actions/github";

type CommitResponse = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    } | null;
  };
};

type PullRequestResponse = {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: {
    login: string;
  };
};

type PullRequestListItem = {
  id: number;
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
};

type IssueResponse = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: {
    login: string;
  };
};

function toNumberOrUndefined(value: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Invalid number input: ${value}`);
  }

  return parsedValue;
}

function toPullRequestListItem(
  pullRequest: PullRequestResponse,
): PullRequestListItem {
  return {
    id: pullRequest.id,
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.state,
    url: pullRequest.html_url,
    author: pullRequest.user.login,
  };
}

async function run(): Promise<void> {
  try {
    const token = core.getInput("github-token", { required: true });
    const contextOwner = github.context.repo.owner;
    const contextRepo = github.context.repo.repo;

    const owner = core.getInput("owner") || contextOwner;
    const repo = core.getInput("repo") || contextRepo;
    const commitSha = core.getInput("commit-sha") || github.context.sha;

    const pullRequestInput = core.getInput("pr-number");
    const issueInput = core.getInput("issue-number");

    const pullRequestFromEvent =
      github.context.payload.pull_request?.number ?? undefined;
    const issueFromEvent = github.context.payload.issue?.number ?? undefined;

    const pullRequestNumber =
      toNumberOrUndefined(pullRequestInput) ?? pullRequestFromEvent;
    const issueNumber = toNumberOrUndefined(issueInput) ?? issueFromEvent;

    const octokit = github.getOctokit(token);

    const { data: commitData } = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: commitSha,
    });

    const commit = commitData as CommitResponse;

    let resolvedPullRequestNumber = pullRequestNumber;
    if (!resolvedPullRequestNumber) {
      const { data: associatedPullRequests } =
        await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
          owner,
          repo,
          commit_sha: commit.sha,
        });
      resolvedPullRequestNumber = associatedPullRequests[0]?.number;
    }

    let pullRequest: PullRequestResponse | undefined;
    if (resolvedPullRequestNumber) {
      const { data: pullRequestData } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: resolvedPullRequestNumber,
      });
      pullRequest = pullRequestData as PullRequestResponse;
    }

    let issue: IssueResponse | undefined;
    if (issueNumber) {
      const { data: issueData } = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });
      issue = issueData as IssueResponse;
    }

    const [openPullRequests, closedPullRequests] = await Promise.all([
      octokit.paginate(octokit.rest.pulls.list, {
        owner,
        repo,
        state: "open",
        per_page: 100,
      }),
      octokit.paginate(octokit.rest.pulls.list, {
        owner,
        repo,
        state: "closed",
        per_page: 100,
      }),
    ]);

    const openPullRequestList = openPullRequests.map((pullRequest) =>
      toPullRequestListItem(pullRequest as PullRequestResponse),
    );
    const closedPullRequestList = closedPullRequests.map((pullRequest) =>
      toPullRequestListItem(pullRequest as PullRequestResponse),
    );

    core.setOutput("commit-sha", commit.sha);
    core.setOutput("commit-url", commit.html_url);
    core.setOutput("commit-message", commit.commit.message);
    core.setOutput("commit-author", commit.commit.author?.name ?? "");
    core.setOutput(
      "commit-json",
      JSON.stringify({
        sha: commit.sha,
        url: commit.html_url,
        message: commit.commit.message,
        author: commit.commit.author?.name ?? "",
        authoredAt: commit.commit.author?.date ?? "",
      }),
    );

    core.setOutput("pr-id", pullRequest?.id?.toString() ?? "");
    core.setOutput("pr-number", pullRequest?.number?.toString() ?? "");
    core.setOutput("pr-url", pullRequest?.html_url ?? "");
    core.setOutput("pr-title", pullRequest?.title ?? "");
    core.setOutput("pr-state", pullRequest?.state ?? "");
    core.setOutput(
      "pr-json",
      pullRequest
        ? JSON.stringify(toPullRequestListItem(pullRequest))
        : "",
    );
    core.setOutput("open-pr-count", openPullRequestList.length.toString());
    core.setOutput("open-prs-json", JSON.stringify(openPullRequestList));
    core.setOutput("closed-pr-count", closedPullRequestList.length.toString());
    core.setOutput("closed-prs-json", JSON.stringify(closedPullRequestList));

    core.setOutput("issue-number", issue?.number?.toString() ?? "");
    core.setOutput("issue-url", issue?.html_url ?? "");
    core.setOutput("issue-title", issue?.title ?? "");
    core.setOutput("issue-state", issue?.state ?? "");
    core.setOutput(
      "issue-json",
      issue
        ? JSON.stringify({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            url: issue.html_url,
            author: issue.user.login,
          })
        : "",
    );

    core.info(
      `Extracted data for ${owner}/${repo}: commit=${commit.sha}, pr=${pullRequest?.number ?? "none"}, openPrs=${openPullRequestList.length}, closedPrs=${closedPullRequestList.length}, issue=${issue?.number ?? "none"}`,
    );
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
      return;
    }
    core.setFailed("Unknown error while extracting repository metadata.");
  }
}

void run();
