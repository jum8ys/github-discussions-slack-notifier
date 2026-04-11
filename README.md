# GitHub Discussions Slack Notifier

This GitHub Action sends Slack notifications when GitHub Discussions are created or commented on.
It can convert GitHub `@mentions` into Slack mentions using inline JSON or a mapping file.

This repository is intended to be used from other repositories.

To use it externally, reference a published tag such as `@v1` or `@v1.0.0`.

## Features

- Supports `discussion.created`, `discussion.answered`, and `discussion_comment.created` notifications
- Includes title, author, summarized body, link, and timestamp in notifications
- Converts GitHub `@mentions` to Slack mentions
- Supports mapping from an inline JSON secret or a repository file
- Enables/disables discussion-created and comment-created notifications independently

## Quick Start (Direct Action)

### 1. Add secrets

Add the following secret to the repository that will use this action:

- `SLACK_WEBHOOK_URL`
- `GITHUB_TO_SLACK_USER_MAPPING_JSON` (optional, recommended for private mapping)

Example value for `GITHUB_TO_SLACK_USER_MAPPING_JSON`:

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

Create the following workflow in the repository that will use this action:

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
        uses: jum8ys/github-discussions-slack-notifier@v1
        with:
          slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
          github_to_slack_user_mapping_json: ${{ secrets.GITHUB_TO_SLACK_USER_MAPPING_JSON }}
          github_to_slack_user_mapping_file: '.github/github-username-slack-mapping.json'
          notify_discussion_created: 'true'
          notify_comment_created: 'true'
          notify_answered: 'true'
```

## Action Inputs

| Input | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| slack_webhook_url | string | yes | - | Slack Incoming Webhook URL |
| github_to_slack_user_mapping_json | string | no | - | Inline JSON for GitHub username -> Slack user ID mapping (recommended for secrets) |
| github_to_slack_user_mapping_file | string | no | .github/github-username-slack-mapping.json | Path to the GitHub username -> Slack user ID mapping JSON |
| notify_discussion_created | string | no | true | Enable notifications for discussion creation |
| notify_comment_created | string | no | true | Enable notifications for discussion comments |
| notify_answered | string | no | true | Enable notifications when a discussion is marked as answered |

If both JSON and file inputs are set, the JSON input is used.

## How Mention Conversion Works

1. Extract `@username` mentions from the text
2. Look up each username in the mapping JSON
3. Convert matched usernames to `<@USER_ID>`
4. Leave unmatched mentions unchanged

## Versioning Recommendation

- Use a tag or commit SHA instead of `@main`
- Example: `@v1` or `@v1.0.0`

If you want to use this action from a different repository, this repository must also be accessible to that repository (for example, public).

## References

- [GitHub Actions](https://docs.github.com/en/actions)
- [GitHub discussion event](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#discussion)
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)
