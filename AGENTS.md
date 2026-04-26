# Copilot Instructions

## Build / Test / Lint

```bash
# Full validation (must pass before committing)
npm run format && npm run lint && npm run build && npm test

# Individual commands
npm run build          # tsc → dist/
npm run test           # jest (all tests)
npx jest --testNamePattern "summarize"   # run a single test by name
npm run lint           # eslint
npm run format         # prettier --write
npm run format:check   # prettier --check (CI-friendly)
```

`dist/` is committed and executed by GitHub Actions (`node24` runtime). Always rebuild and commit `dist/` after changing source files.

## Architecture

This repository is a **GitHub Action** (defined in `action.yml`).

- **Entrypoint**: `src/index.ts` → reads `GITHUB_EVENT_PATH`, dispatches to `notifier.ts` builders, then POSTs to Slack.
- **Core logic**: `src/notifier.ts` — message formatting (`buildDiscussionMessage`, `buildCommentMessage`, `buildAnsweredMessage`), text summarization (`summarize`), GitHub-to-Slack mention conversion (`extractGitHubMentions`, `resolveMentionsToSlack`), webhook sender (`sendSlackMessage`), Bot Token sender (`postSlackApiMessage`).
- **Thread state**: `src/github.ts` — `extractSlackTs` reads the Slack `ts` from a hidden HTML comment (`<!-- slack-notifier:ts=... -->`) in the Discussion body; `appendSlackTsToDiscussion` stores it via a GitHub GraphQL mutation. No external storage needed.
- **Mention mapping**: GitHub usernames are mapped to Slack user IDs via `slack_user_mapping_json` (inline JSON, usually from a secret) or `slack_user_mapping_file_path` (default `.github/slack_user_mapping.json`). No Slack API call is made.
- **Slack transport (webhook mode)**: `sendSlackMessage` — raw `https.request` to an Incoming Webhook URL. No Slack SDK dependency.
- **Slack transport (Bot Token mode)**: `postSlackApiMessage` — raw `https.request` to `chat.postMessage`. Returns `ts` for threading. Requires `slack_bot_token` and `slack_channel_id` inputs.

Flows:
- Webhook mode: `Actions event → index.ts → notifier.ts (build + resolve mentions) → Slack Incoming Webhook`
- Bot Token / new discussion: `Actions event → index.ts → notifier.ts → chat.postMessage → ts → github.ts (store ts in Discussion body)`
- Bot Token / comment or answer with stored ts: `Actions event → index.ts → github.ts (extract ts from body) → notifier.ts → chat.postMessage (thread reply)`

## Conventions

- TypeScript with `"module": "NodeNext"` and `"target": "ES2020"`. Imports use `.js` extensions (`import … from './notifier.js'`).
- Zero runtime dependencies — only Node.js built-ins (`fs`, `https`, `url`).
- Action inputs are read from `INPUT_*` environment variables (GitHub Actions convention).
- Tests live in `test/` (not `__tests__/`). Jest is configured via `jest.config.js` with `ts-jest` preset.
- Prettier: single quotes, semicolons, 100-char print width, trailing commas in ES5 positions.
- ESLint: `@typescript-eslint/recommended` + `eslint-config-prettier`. `no-explicit-any` is warn, unused vars with `_` prefix are allowed.

## Test Data Conventions

- **GitHub usernames** in tests must be UUIDs (e.g. `'e4b97c52-1f3a-4d8e-b206-7a9c3f510d4e'`) — never human-readable names like `test-user-alpha` that could collide with real GitHub accounts. Use named constants prefixed `NEVER_REAL_GH_USER_*`.
- **URLs** in tests must use the `.invalid` TLD (e.g. `https://github.invalid/...`) which is guaranteed non-resolvable by RFC 2606.
- **Slack IDs** in tests use the `NEVER_REAL_SLACK_ID_*` constant pattern with clearly fake values.

## Supported Events

The action handles the following GitHub event types:

| Event | Action |
|---|---|
| `discussion` | `created` |
| `discussion` | `answered` |
| `discussion_comment` | `created` |

Notification scope is controlled by workflow `on:` triggers (there are no `notify_*` inputs).
Other event/action combinations are silently ignored.

## Reference Documentation

Consult these official docs before making implementation changes:

- **GitHub Actions** — https://docs.github.com/en/actions
  Workflow syntax, `action.yml` schema, `workflow_call` for reusable workflows, event payloads, and secrets handling.
- **Slack API** — https://docs.slack.dev/
  Incoming Webhooks payload format, message formatting (mrkdwn), and link/mention syntax (`<@USER_ID>`, `<URL|label>`).

## Branch Strategy

Development uses a short-lived `develop` branch:

1. **Start development** — cut a `develop` branch from `main`:
   ```bash
   git checkout main && git pull
   git checkout -b develop
   ```
2. **Develop & test** — commit to `develop`, push, and test with `@develop` in your workflow.
3. **Merge to main** — squash merge when ready:
   ```bash
   git checkout main
   git merge --squash develop
   git commit -m "feat: your feature summary (develop @ <short-sha>)"
   ```
4. **Delete `develop`** — clean up after merging:
   ```bash
   git branch -d develop
   git push origin --delete develop
   ```
5. **Repeat** — create a new `develop` branch for the next development cycle.

> Use `@develop` in your workflow's `uses:` to test before releasing to `main`.

## Release

- README should stay user-facing and describe only how to use this action from another repository.
- Developer and release workflow notes belong in `AGENTS.md`, not `README.md`.
- `PROMPT.md` is gitignored and must never be committed.

### Semantic versioning

Follow [Semantic Versioning](https://semver.org/):

| Change type | Example | Version bump |
|---|---|---|
| Bug fix, dependency update | fix typo, patch dependency | `v1.0.0` → `v1.0.1` |
| New feature, non-breaking change | add Block Kit UI, new input | `v1.0.0` → `v1.1.0` |
| Breaking change | rename input, change behavior | `v1.0.0` → `v2.0.0` |

**Always decide the correct version bump before tagging. When in doubt, re-read this table.**

### Tagging and pushing

> **IMPORTANT: Never create or push git tags without being explicitly asked to by the user.**
> The user decides when to release. Only commit and push code changes; leave tagging to the user or to an explicit "publish"/"release" request.

```bash
# Replace vX.Y.Z with the correct version
git tag vX.Y.Z
git tag -f vX          # move the major tag (v1, v2, ...) to latest
git push origin vX.Y.Z
git push -f origin vX
```

To release, say **"publish"** or **"release"**. The agent will read `.claude/skills/publish/SKILL.md` and follow those steps automatically.
