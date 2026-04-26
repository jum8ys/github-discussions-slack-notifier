# GitHub Discussions Slack Notifier

This GitHub Action sends Slack notifications when GitHub Discussions are created, answered, or commented on.
It can convert GitHub `@mentions` into Slack mentions using inline JSON or a mapping file.

## Features

- Supports `discussion.created`, `discussion.answered`, and `discussion_comment.created` notifications
- Includes title, author, summarized body, and link in notifications
- Converts GitHub `@mentions` to Slack mentions
- Supports mapping from an inline JSON secret or a repository file
- **Thread support** — comments and answers post as Slack thread replies under the original Discussion message (requires Bot Token mode)

## Usage

There are two modes: **Webhook mode** (simple, no thread support) and **Bot Token mode** (thread support).

---

### Webhook mode

The simplest setup. Each notification is an independent message in the Slack channel.

#### 1. Create an Incoming Webhook and add the URL as a secret

1. Go to <https://api.slack.com/apps>, create an app (or open an existing one), and enable **Incoming Webhooks**.
2. Click **Add New Webhook to Workspace**, pick the target channel, and copy the generated webhook URL.
3. Add it to the repository secrets as `SLACK_WEBHOOK_URL`.

#### 2. Add the workflow

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
      - name: Notify Slack
        uses: jum8ys/github-discussions-slack-notifier@v3
        with:
          slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
          slack_user_mapping_json: ${{ secrets.SLACK_USER_MAPPING_JSON }}
```

---

### Bot Token mode (with thread support)

Comments and answers are posted as replies in the Slack thread of the original Discussion message.
The action stores the Slack message timestamp in the Discussion body as a hidden HTML comment — no external storage needed.

#### 1. Create a Slack app and install it to your workspace

1. Go to <https://api.slack.com/apps> and click **Create New App** → **From scratch**. Pick a name and your workspace.
2. Open **OAuth & Permissions** → **Scopes** → **Bot Token Scopes**, and add `chat:write`. This is the only scope this action requires.
3. Click **Install to Workspace** at the top of the same page and approve the install. Copy the generated **Bot User OAuth Token** (starts with `xoxb-`).
4. In Slack, invite the bot to the target channel: `/invite @your-bot-name`. The bot must be a member of the channel for `chat.postMessage` to succeed.
5. Copy the channel ID from the channel's details (Slack desktop: channel name → **About** → **Channel ID**, or from the URL: `https://app.slack.com/client/.../C0123ABCDE`).

#### 2. Add secrets

| Secret | Description |
| --- | --- |
| `SLACK_BOT_TOKEN` | The Bot User OAuth Token (`xoxb-...`) from step 1. |
| `SLACK_CHANNEL_ID` | The channel ID (e.g. `C0123ABCDE`) from step 1. |
| `SLACK_USER_MAPPING_JSON` | Optional. GitHub username → Slack user ID mapping. |

#### 3. Add the workflow

```yaml
name: Notify Discussions to Slack

on:
  discussion:
    types: [created, answered]
  discussion_comment:
    types: [created]

permissions:
  discussions: write  # required to store the Slack thread ts in the Discussion body

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack
        uses: jum8ys/github-discussions-slack-notifier@v3
        with:
          slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
          slack_channel_id: ${{ secrets.SLACK_CHANNEL_ID }}
          thread_mode: channel_and_thread   # or thread_only
          slack_user_mapping_json: ${{ secrets.SLACK_USER_MAPPING_JSON }}
```

**`thread_mode` options:**

| Value | Behavior |
| --- | --- |
| `channel_and_thread` (default) | Thread reply also appears in the channel feed |
| `thread_only` | Thread reply appears only in the thread |

**Migration / threading notes:**

- If a Discussion was created before threading was enabled, the first post-migration event (comment or answer) is sent as a top-level message and its timestamp is saved — all subsequent comments will thread under it automatically.
- When the first post-migration event is `discussion.answered`, the **answer** message becomes the thread parent. Later comments will appear as replies to the answer, not to the original Discussion.
- If multiple events fire on a Discussion that has no stored timestamp yet (e.g., several comments posted within seconds of each other), the first few may each be sent as top-level messages before one of them "wins" and becomes the thread parent. Once a timestamp is stored in the Discussion body, subsequent events thread reliably.

> [!IMPORTANT]
> The action stores the Slack thread timestamp in the Discussion body as a hidden HTML comment like `<!-- slack-notifier:ts=1234567890.123456 -->`. It is invisible in the rendered view but **visible in the Markdown editor**. If a user removes this marker while editing the Discussion, subsequent comments will start a new thread instead of replying to the original one.

---

### (Optional) Use a repository file for mention mapping

Instead of `slack_user_mapping_json`, create `.github/slack_user_mapping.json`:

```json
{
  "john-doe": "UXXXXXXXX",
  "jane-smith": "UYYYYYYYY"
}
```

> [!NOTE]
> If you use `slack_user_mapping_file_path`, add `actions/checkout@v6` before this action so the file can be read.

---

## Action Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `slack_webhook_url` | if no `slack_bot_token` | - | Slack Incoming Webhook URL. |
| `slack_bot_token` | if no `slack_webhook_url` | - | Slack Bot Token (`xoxb-...`). Enables thread support via `chat.postMessage`. |
| `slack_channel_id` | if `slack_bot_token` set | - | Slack channel ID (e.g. `C0123ABCDE`). |
| `thread_mode` | no | `channel_and_thread` | `channel_and_thread` or `thread_only`. |
| `github_token` | no | `${{ github.token }}` | GitHub token used to store the Slack thread ts in the Discussion body. The default workflow token is used automatically. |
| `slack_user_mapping_json` | no | - | Inline JSON for GitHub username → Slack user ID mapping. Takes precedence over `slack_user_mapping_file_path`. |
| `slack_user_mapping_file_path` | no | `.github/slack_user_mapping.json` | Path to the GitHub username → Slack user ID mapping JSON file. |

## How Mention Conversion Works

1. Extract `@username` mentions from the text
2. Look up each username in the mapping JSON
3. Convert matched usernames to `<@USER_ID>`
4. Leave unmatched mentions unchanged
