---
name: publish
description: Release a new version of this action. Use when asked to publish, release, or tag a new version.
allowed-tools: bash, read, edit
---

Execute the following release steps:

1. **Find the latest tag:**
   ```bash
   git tag --list 'v*.*.*' --sort=-version:refname | head -1
   ```

2. **Determine bump type** from commits since that tag:
   ```bash
   git log <last-tag>..HEAD --oneline
   ```
   Apply the highest matching rule across all commits:
   - `BREAKING CHANGE` in body, or `!` after type (e.g. `feat!:`) → **major**
   - `feat:` → **minor**
   - anything else (`fix:`, `chore:`, `docs:`, etc.) → **patch**

   If no tags exist yet, use `v1.0.0`.

3. **Calculate next version** and show it to the user before proceeding.

4. **Bump version in `package.json`** using `npm version` (no git tag):
   ```bash
   # Use the bump type determined in step 2: major | minor | patch
   npm version <major|minor|patch> --no-git-tag-version
   ```

5. **Validate:**
   ```bash
   npm run format && npm run lint && npm run build && npm test
   ```
   Stop if anything fails.

6. **Commit** all changes on the current branch. Stage all tracked modifications (includes `package.json`, `package-lock.json`, `dist/`, and any skill/config files updated during this process):
   ```bash
   git add -u
   git commit -m "chore: release vX.Y.Z

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
   ```

7. **Squash merge `develop` into `main`:**
   ```bash
   DEVELOP_SHA=$(git rev-parse --short HEAD)
   git checkout main
   git merge --squash develop
   ```
   Compose the commit message as follows:
   - **Subject line**: use the conventional-commit type and scope of the highest-impact change (e.g. `feat:`, `fix:`), followed by a short human-readable summary of *what changed*, then `(develop @ SHA)`. Example: `feat: show Slack mentions outside attachment; link GitHub mentions in body (develop @ e018072)`
   - **Body**: list each non-trivial commit from `develop` as a bullet (`- <type>: <subject>`), omitting pure style/chore/test commits unless they matter to users.
   - Append the co-author trailer.

   Example final message:
   ```
   feat: show Slack mentions outside attachment; link GitHub mentions in body (develop @ e018072)

   - feat: move Slack mentions outside attachment, keep GitHub format in body
   - feat: show all mentions in outer blocks; link unmapped to GitHub profile
   - feat: link GitHub mentions in body text
   - fix: prevent mrkdwn link from being split at body truncation boundary

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
   ```

8. **Tag and push `main`:**
   ```bash
   git tag vX.Y.Z
   git tag -f vMAJOR
   git push origin main
   git push origin vX.Y.Z
   git push -f origin vMAJOR
   ```

9. **Delete `develop` branch** (use `-D` because squash merge leaves it "unmerged" in git's view):
   ```bash
   git branch -D develop
   git push origin --delete develop
   ```
