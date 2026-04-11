Execute the following release steps for version $ARGUMENTS:

1. **Validate** the version matches `vMAJOR.MINOR.PATCH` format. Stop if it doesn't.

2. **Update** `package.json` `"version"` field to `MAJOR.MINOR.PATCH` (without `v` prefix).

3. **Validate** with:
   ```
   npm run format && npm run lint && npm run build && npm test
   ```
   Stop and fix any errors before proceeding.

4. **Commit** all staged changes with:
   ```
   chore: release $ARGUMENTS

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
   ```

5. **Tag** the release:
   ```bash
   git tag $ARGUMENTS
   git tag -f vMAJOR
   ```

6. **Push** everything:
   ```bash
   git push origin main
   git push origin $ARGUMENTS
   git push -f origin vMAJOR
   ```

Do not decide the version automatically. Always use exactly what was passed as `$ARGUMENTS`.
