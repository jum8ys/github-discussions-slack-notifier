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

6. **Commit** all changes on the current branch (`develop`):
   ```
   chore: release vX.Y.Z

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
   ```

7. **Squash merge `develop` into `main`:**
   ```bash
   DEVELOP_SHA=$(git rev-parse --short HEAD)
   git checkout main
   git merge --squash develop
   git commit -m "chore: release vX.Y.Z (develop @ ${DEVELOP_SHA})

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
   ```

8. **Tag and push `main`:**
   ```bash
   git tag vX.Y.Z
   git tag -f vMAJOR
   git push origin main
   git push origin vX.Y.Z
   git push -f origin vMAJOR
   ```

9. **Delete `develop` branch:**
   ```bash
   git branch -d develop
   git push origin --delete develop
   ```
