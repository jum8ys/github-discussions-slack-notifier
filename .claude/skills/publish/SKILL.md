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

4. **Update** `package.json` `"version"` to `MAJOR.MINOR.PATCH` (no `v` prefix).

5. **Validate:**
   ```bash
   npm run format && npm run lint && npm run build && npm test
   ```
   Stop if anything fails.

6. **Commit** all changes:
   ```
   chore: release vX.Y.Z

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
   ```

7. **Tag and push:**
   ```bash
   git tag vX.Y.Z
   git tag -f vMAJOR
   git push origin main
   git push origin vX.Y.Z
   git push -f origin vMAJOR
   ```
