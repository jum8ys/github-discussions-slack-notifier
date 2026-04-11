# GitHub Discussions Slack Notifier

This GitHub Action sends Slack notifications when GitHub Discussions are created or commented on.
It can convert GitHub `@mentions` into Slack mentions using inline JSON or a mapping file.

## Features

- Supports `discussion.created`, `discussion.answered`, and `discussion_comment.created` notifications
- Includes title, author, summarized body, and link in notifications
- Converts GitHub `@mentions` to Slack mentions
- Supports mapping from an inline JSON secret or a repository file

## Quick Start

### 1. Add secrets

Add the following secret to the repository that will use this action:

- `SLACK_WEBHOOK_URL`
- `SLACK_USER_MAPPING_JSON` (optional, recommended for private mapping)

Example value for `SLACK_USER_MAPPING_JSON`:

```json
{"john-doe":"UXXXXXXXX","jane-smith":"UYYYYYYYY"}
```

### 2. (Optional) Use a repository file instead of secret

Create `.github/github-username-slack-mapping.json` in the repository:

```json
{
  "john-doe": "UXXXXXXXX",
  "jane-smith": "UYYYYYYYY"
}
```

### 3. Add the action to your workflow

Create the following workflow in the repository that will use this action. The `on:` section controls which events trigger notifications — remove event types you don't want.

```yaml
name: Notify Discussions to Slack

on:
  discussion:
    types: [created, answered]
  discussion_comment:
    types: [created]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Notify Slack
        uses: jum8ys/github-discussions-slack-notifier@v2
        with:
          slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
          slack_user_mapping_json: ${{ secrets.SLACK_USER_MAPPING_JSON }}
```

> [!NOTE]
> If both `slack_user_mapping_json` and `slack_user_mapping_file` are set, the JSON input takes precedence.

## Action Inputs

| Input | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| slack_webhook_url | string | yes | - | Slack Incoming Webhook URL |
| slack_user_mapping_json | string | no | - | Inline JSON for GitHub username -> Slack user ID mapping. Takes precedence over `slack_user_mapping_file` if both are set. |
| slack_user_mapping_file | string | no | .github/github-username-slack-mapping.json | Path to the GitHub username -> Slack user ID mapping JSON |

## How Mention Conversion Works

1. Extract `@username` mentions from the text
2. Look up each username in the mapping JSON
3. Convert matched usernames to `<@USER_ID>`
4. Leave unmatched mentions unchanged
