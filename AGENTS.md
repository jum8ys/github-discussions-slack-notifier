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

`dist/` is committed and executed by GitHub Actions (`node20` runtime). Always rebuild and commit `dist/` after changing source files.

## Architecture

This repository is a **GitHub Action** (defined in `action.yml`) plus an optional **reusable workflow** (`.github/workflows/github-discussions-slack-notifier.yml`).

- **Entrypoint**: `src/index.ts` → reads `GITHUB_EVENT_PATH`, dispatches to `notifier.ts` builders, then POSTs to Slack.
- **Core logic**: `src/notifier.ts` — message formatting (`buildDiscussionMessage`, `buildCommentMessage`), text summarization (`summarize`), GitHub-to-Slack mention conversion (`extractGitHubMentions`, `resolveMentionsToSlack`), and the HTTP sender (`sendSlackMessage`).
- **Mention mapping**: A JSON file (default `.github/github-username-slack-mapping.json`) maps GitHub usernames to Slack user IDs. No Slack API call is made; mapping is file-based only.
- **Slack transport**: Raw `https.request` to an Incoming Webhook URL — no Slack SDK dependency.

Flow: `Actions event → index.ts (env/payload parsing) → notifier.ts (build message + resolve mentions) → Slack webhook`

## Conventions

- TypeScript with `"module": "NodeNext"` and `"target": "ES2020"`. Imports use `.js` extensions (`import … from './notifier.js'`).
- Zero runtime dependencies — only Node.js built-ins (`fs`, `https`, `url`).
- Action inputs are read from `INPUT_*` environment variables (GitHub Actions convention), with fallback to unprefixed env vars for local testing.
- Tests live in `test/` (not `__tests__/`). Jest is configured via `jest.config.js` with `ts-jest` preset.
- Prettier: single quotes, semicolons, 100-char print width, trailing commas in ES5 positions.
- ESLint: `@typescript-eslint/recommended` + `eslint-config-prettier`. `no-explicit-any` is warn, unused vars with `_` prefix are allowed.

## Supported Events

The action handles two GitHub event types:

| Event | Action | Flag |
|---|---|---|
| `discussion` | `created` | `notify_discussion_created` |
| `discussion_comment` | `created` | `notify_comment_created` |

Other event/action combinations are silently ignored.

## Reference Documentation

Consult these official docs before making implementation changes:

- **GitHub Actions** — https://docs.github.com/en/actions
  Workflow syntax, `action.yml` schema, `workflow_call` for reusable workflows, event payloads, and secrets handling.
- **Slack API** — https://docs.slack.dev/
  Incoming Webhooks payload format, message formatting (mrkdwn), and link/mention syntax (`<@USER_ID>`, `<URL|label>`).

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

```bash
# Replace vX.Y.Z with the correct version
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git tag -f vX          # move the major tag (v1, v2, ...) to latest
git push origin vX.Y.Z
git push origin vX --force
```
