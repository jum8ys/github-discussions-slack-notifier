Execute the following release steps with no arguments needed.

1. **Find the latest tag** by running:
   ```bash
   git tag --list 'v*.*.*' --sort=-version:refname | head -1
   ```

2. **Determine the bump type** by analyzing commit messages since the last tag:
   ```bash
   git log <last-tag>..HEAD --oneline
   ```
   Apply the **highest** rule that matches any commit:
   - `BREAKING CHANGE` in body, or `!` after type (e.g. `feat!:`) → **major**
   - `feat:` → **minor**
   - anything else (`fix:`, `chore:`, `docs:`, `refactor:`, etc.) → **patch**

   If no tags exist yet, start from `v1.0.0`.

3. **Calculate next version** from `vMAJOR.MINOR.PATCH`:
   - major → `v(MAJOR+1).0.0`
   - minor → `vMAJOR.(MINOR+1).0`
   - patch → `vMAJOR.MINOR.(PATCH+1)`

   Show the user the determined bump type and next version before proceeding.

4. **Update** `package.json` `"version"` field to `MAJOR.MINOR.PATCH` (without `v` prefix).

5. **Validate** with:
   ```
   npm run format && npm run lint && npm run build && npm test
   ```
   Stop and fix any errors before proceeding.

6. **Commit** all staged changes with:
   ```
   chore: release vX.Y.Z

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
   ```

7. **Tag** the release:
   ```bash
   git tag vX.Y.Z
   git tag -f vMAJOR
   ```

8. **Push** everything:
   ```bash
   git push origin main
   git push origin vX.Y.Z
   git push -f origin vMAJOR
   ```
