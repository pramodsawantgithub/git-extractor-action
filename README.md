# git-extractor-action #

Reusable GitHub Action that uses Octokit to fetch commit, pull request, and issue metadata and expose it as workflow outputs.

It also returns repository-wide pull request lists for both open and closed states.

It can also calculate DORA metrics from GitHub Actions deployment workflow runs.

## Inputs

- `github-token` (required)
- `owner` (optional, defaults to current repository owner)
- `repo` (optional, defaults to current repository name)
- `commit-sha` (optional, defaults to `${{ github.sha }}`)
- `pr-number` (optional, defaults to pull request number from event, or first PR associated with commit)
- `issue-number` (optional, defaults to issue number from `issues` event)
- `include-dora-metrics` (optional, default `true`)
- `dora-lookback-days` (optional, default `30`)
- `dora-branch` (optional, default `main`)
- `dora-workflow-id` (optional, recommended for accuracy, example `deploy.yml`)

## Outputs

- `commit-sha`
- `commit-url`
- `commit-message`
- `commit-author`
- `commit-json`
- `pr-id`
- `pr-number`
- `pr-url`
- `pr-title`
- `pr-state`
- `pr-json`
- `open-pr-count`
- `open-prs-json`
- `closed-pr-count`
- `closed-prs-json`
- `dora-lookback-days`
- `dora-branch`
- `dora-workflow-id`
- `dora-deployment-count`
- `dora-successful-deployment-count`
- `dora-failed-deployment-count`
- `dora-deployment-frequency-per-day`
- `dora-change-failure-rate`
- `dora-lead-time-hours`
- `dora-mttr-hours`
- `dora-json`
- `issue-number`
- `issue-url`
- `issue-title`
- `issue-state`
- `issue-json`

## Usage

```yaml
name: Use Git Extractor

on:
  workflow_dispatch:

jobs:
  extract:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Extract commit, PR, and issue metadata
        id: extractor
        uses: your-org/git-extractor-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          issue-number: 123
          dora-workflow-id: deploy.yml
          dora-lookback-days: 30

      - name: Print outputs
        run: |
          echo "Commit SHA: ${{ steps.extractor.outputs.commit-sha }}"
          echo "Commit URL: ${{ steps.extractor.outputs.commit-url }}"
          echo "PR ID: ${{ steps.extractor.outputs.pr-id }}"
          echo "PR number: ${{ steps.extractor.outputs.pr-number }}"
          echo "PR title: ${{ steps.extractor.outputs.pr-title }}"
          echo "Open PR count: ${{ steps.extractor.outputs.open-pr-count }}"
          echo "Closed PR count: ${{ steps.extractor.outputs.closed-pr-count }}"
          echo "DORA deployment count: ${{ steps.extractor.outputs.dora-deployment-count }}"
          echo "DORA deployment frequency/day: ${{ steps.extractor.outputs.dora-deployment-frequency-per-day }}"
          echo "DORA change failure rate (%): ${{ steps.extractor.outputs.dora-change-failure-rate }}"
          echo "DORA lead time (hours): ${{ steps.extractor.outputs.dora-lead-time-hours }}"
          echo "DORA MTTR (hours): ${{ steps.extractor.outputs.dora-mttr-hours }}"
          echo "Issue number: ${{ steps.extractor.outputs.issue-number }}"
          echo "Issue title: ${{ steps.extractor.outputs.issue-title }}"
          echo "PR JSON: ${{ steps.extractor.outputs.pr-json }}"
          echo "Open PR list: ${{ steps.extractor.outputs.open-prs-json }}"
          echo "Closed PR list: ${{ steps.extractor.outputs.closed-prs-json }}"
          echo "Issue JSON: ${{ steps.extractor.outputs.issue-json }}"
```

Each item in `open-prs-json` and `closed-prs-json` contains:

- `id`
- `number`
- `title`
- `state`
- `url`
- `author`

`dora-json` structure:

- `lookbackDays`
- `branch`
- `workflowId`
- `deploymentCount`
- `successfulDeploymentCount`
- `failedDeploymentCount`
- `deploymentFrequencyPerDay`
- `changeFailureRatePercent`
- `leadTimeHours`
- `mttrHours`

Notes for DORA accuracy:

- Set `dora-workflow-id` to a deployment workflow (for example `deploy.yml`) to avoid counting non-deployment workflows.
- Lead time is calculated as time from commit author/committer timestamp to successful deployment completion timestamp.
- MTTR is calculated from each failed deployment completion time to the next successful deployment completion time.

## Local development

```bash
npm install
npm run build
npm run package
```

The bundled file in `dist/` should be committed before tagging a release for public use.
