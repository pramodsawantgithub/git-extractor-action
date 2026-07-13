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
    committer: {
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

type WorkflowRunResponse = {
  id: number;
  name: string | null;
  head_sha: string;
  status: string | null;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
};

type DoraMetrics = {
  lookbackDays: number;
  branch: string;
  workflowId: string;
  deploymentCount: number;
  successfulDeploymentCount: number;
  failedDeploymentCount: number;
  deploymentFrequencyPerDay: number;
  changeFailureRatePercent: number;
  leadTimeHours: number | null;
  mttrHours: number | null;
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

function toPositiveInteger(value: string, name: string, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return parsedValue;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function hoursBetween(start: string, end: string): number | null {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  const differenceInMilliseconds = endDate.getTime() - startDate.getTime();
  if (differenceInMilliseconds < 0) {
    return null;
  }

  return differenceInMilliseconds / (1000 * 60 * 60);
}

async function calculateDoraMetrics(params: {
  octokit: ReturnType<typeof github.getOctokit>;
  owner: string;
  repo: string;
  branch: string;
  lookbackDays: number;
  workflowId: string;
}): Promise<DoraMetrics> {
  const { octokit, owner, repo, branch, lookbackDays, workflowId } = params;

  const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const createdFilter = `>=${fromDate.toISOString()}`;

  const commonOptions = {
    owner,
    repo,
    branch,
    created: createdFilter,
    per_page: 100,
  } as const;

  const workflowRuns = workflowId
    ? await octokit.paginate(octokit.rest.actions.listWorkflowRuns, {
        ...commonOptions,
        workflow_id: workflowId,
      })
    : await octokit.paginate(octokit.rest.actions.listWorkflowRunsForRepo, {
        ...commonOptions,
      });

  const completedDeployments = (workflowRuns as WorkflowRunResponse[])
    .filter(
      (run) =>
        run.status === "completed" &&
        (run.conclusion === "success" || run.conclusion === "failure"),
    )
    .sort(
      (first, second) =>
        new Date(first.updated_at).getTime() -
        new Date(second.updated_at).getTime(),
    );

  const successfulDeployments = completedDeployments.filter(
    (run) => run.conclusion === "success",
  );
  const failedDeployments = completedDeployments.filter(
    (run) => run.conclusion === "failure",
  );

  const deploymentCount = completedDeployments.length;
  const deploymentFrequencyPerDay =
    lookbackDays > 0 ? deploymentCount / lookbackDays : 0;
  const changeFailureRatePercent =
    deploymentCount > 0
      ? (failedDeployments.length / deploymentCount) * 100
      : 0;

  const commitTimestampCache = new Map<string, string>();
  const leadTimeSamples: number[] = [];

  for (const run of successfulDeployments) {
    if (!run.head_sha) {
      continue;
    }

    let commitTimestamp = commitTimestampCache.get(run.head_sha);
    if (!commitTimestamp) {
      const { data: runCommitData } = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: run.head_sha,
      });

      const runCommit = runCommitData as CommitResponse;
      commitTimestamp =
        runCommit.commit.author?.date ?? runCommit.commit.committer?.date ?? "";
      if (!commitTimestamp) {
        continue;
      }

      commitTimestampCache.set(run.head_sha, commitTimestamp);
    }

    const leadTimeHours = hoursBetween(commitTimestamp, run.updated_at);
    if (leadTimeHours !== null) {
      leadTimeSamples.push(leadTimeHours);
    }
  }

  const mttrSamples: number[] = [];
  for (const failedRun of failedDeployments) {
    const recoveryRun = successfulDeployments.find(
      (candidate) =>
        new Date(candidate.updated_at).getTime() >
        new Date(failedRun.updated_at).getTime(),
    );

    if (!recoveryRun) {
      continue;
    }

    const mttrHours = hoursBetween(failedRun.updated_at, recoveryRun.updated_at);
    if (mttrHours !== null) {
      mttrSamples.push(mttrHours);
    }
  }

  return {
    lookbackDays,
    branch,
    workflowId,
    deploymentCount,
    successfulDeploymentCount: successfulDeployments.length,
    failedDeploymentCount: failedDeployments.length,
    deploymentFrequencyPerDay: roundTo(deploymentFrequencyPerDay, 4),
    changeFailureRatePercent: roundTo(changeFailureRatePercent, 2),
    leadTimeHours:
      average(leadTimeSamples) === null
        ? null
        : roundTo(average(leadTimeSamples) as number, 2),
    mttrHours:
      average(mttrSamples) === null
        ? null
        : roundTo(average(mttrSamples) as number, 2),
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
    const includeDoraMetrics = core.getBooleanInput("include-dora-metrics");
    const doraLookbackDays = toPositiveInteger(
      core.getInput("dora-lookback-days"),
      "dora-lookback-days",
      30,
    );
    const doraWorkflowId = core.getInput("dora-workflow-id");
    const doraBranch = core.getInput("dora-branch") || "main";

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

    let doraMetrics: DoraMetrics | undefined;
    if (includeDoraMetrics) {
      doraMetrics = await calculateDoraMetrics({
        octokit,
        owner,
        repo,
        branch: doraBranch,
        lookbackDays: doraLookbackDays,
        workflowId: doraWorkflowId,
      });
    }

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

    core.setOutput("dora-lookback-days", doraMetrics?.lookbackDays.toString() ?? "");
    core.setOutput("dora-branch", doraMetrics?.branch ?? "");
    core.setOutput("dora-workflow-id", doraMetrics?.workflowId ?? "");
    core.setOutput(
      "dora-deployment-count",
      doraMetrics?.deploymentCount.toString() ?? "",
    );
    core.setOutput(
      "dora-successful-deployment-count",
      doraMetrics?.successfulDeploymentCount.toString() ?? "",
    );
    core.setOutput(
      "dora-failed-deployment-count",
      doraMetrics?.failedDeploymentCount.toString() ?? "",
    );
    core.setOutput(
      "dora-deployment-frequency-per-day",
      doraMetrics?.deploymentFrequencyPerDay.toString() ?? "",
    );
    core.setOutput(
      "dora-change-failure-rate",
      doraMetrics?.changeFailureRatePercent.toString() ?? "",
    );
    core.setOutput(
      "dora-lead-time-hours",
      doraMetrics?.leadTimeHours !== null && doraMetrics?.leadTimeHours !== undefined
        ? doraMetrics.leadTimeHours.toString()
        : "",
    );
    core.setOutput(
      "dora-mttr-hours",
      doraMetrics?.mttrHours !== null && doraMetrics?.mttrHours !== undefined
        ? doraMetrics.mttrHours.toString()
        : "",
    );
    core.setOutput("dora-json", doraMetrics ? JSON.stringify(doraMetrics) : "");

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
      `Extracted data for ${owner}/${repo}: commit=${commit.sha}, pr=${pullRequest?.number ?? "none"}, openPrs=${openPullRequestList.length}, closedPrs=${closedPullRequestList.length}, doraDeployments=${doraMetrics?.deploymentCount ?? "skipped"}, issue=${issue?.number ?? "none"}`,
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
