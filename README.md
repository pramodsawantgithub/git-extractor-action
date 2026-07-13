# git-extractor-action

Reusable GitHub Action that uses Octokit to fetch commit, pull request, and issue metadata and expose it as workflow outputs.

## Inputs

- `github-token` (required)
- `owner` (optional, defaults to current repository owner)
- `repo` (optional, defaults to current repository name)
- `commit-sha` (optional, defaults to `${{ github.sha }}`)
- `pr-number` (optional, defaults to pull request number from event, or first PR associated with commit)
- `issue-number` (optional, defaults to issue number from `issues` event)

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

      - name: Print outputs
        run: |
          echo "Commit SHA: ${{ steps.extractor.outputs.commit-sha }}"
          echo "Commit URL: ${{ steps.extractor.outputs.commit-url }}"
          echo "PR ID: ${{ steps.extractor.outputs.pr-id }}"
          echo "PR number: ${{ steps.extractor.outputs.pr-number }}"
          echo "PR title: ${{ steps.extractor.outputs.pr-title }}"
          echo "Issue number: ${{ steps.extractor.outputs.issue-number }}"
          echo "Issue title: ${{ steps.extractor.outputs.issue-title }}"
          echo "PR JSON: ${{ steps.extractor.outputs.pr-json }}"
          echo "Issue JSON: ${{ steps.extractor.outputs.issue-json }}"
```

## Local development

```bash
npm install
npm run build
npm run package
```

The bundled file in `dist/` should be committed before tagging a release for public use.
