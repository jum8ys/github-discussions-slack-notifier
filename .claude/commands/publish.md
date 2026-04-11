Execute the following release steps. The bump type is: **$ARGUMENTS** (major / minor / patch).

1. **Determine the next version** by running:
   ```bash
   git tag --list 'v*.*.*' --sort=-version:refname | head -1
   ```
   Parse the latest tag as `vMAJOR.MINOR.PATCH`, then increment based on the bump type:
   - `major` → `v(MAJOR+1).0.0`
   - `minor` → `vMAJOR.(MINOR+1).0`
   - `patch` → `vMAJOR.MINOR.(PATCH+1)`

   If no tags exist, start from `v1.0.0` regardless of bump type.
   If `$ARGUMENTS` is empty, default to `patch`.

2. **Update** `package.json` `"version"` field to `MAJOR.MINOR.PATCH` (without `v` prefix).

3. **Validate** with:
   ```
   npm run format && npm run lint && npm run build && npm test
   ```
   Stop and fix any errors before proceeding.

4. **Commit** all staged changes with:
   ```
   chore: release vX.Y.Z

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
   ```

5. **Tag** the release:
   ```bash
   git tag vX.Y.Z
   git tag -f vMAJOR
   ```

6. **Push** everything:
   ```bash
   git push origin main
   git push origin vX.Y.Z
   git push -f origin vMAJOR
   ```
