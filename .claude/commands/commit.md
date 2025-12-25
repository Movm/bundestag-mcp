---
description: Create a git commit following Conventional Commits format
---

Create a git commit for the current changes following the project's Conventional Commits convention.

## Instructions

1. **Check current state** by running these commands in parallel:
   - `git status` - see all changes
   - `git diff` - see unstaged changes
   - `git diff --staged` - see already staged changes
   - `git log --oneline -5` - see recent commit style

2. **Stage all changes**:
   ```bash
   git add .
   ```

3. **Analyze the changes** and determine the commit type:
   - `feat:` - New feature or functionality
   - `fix:` - Bug fix
   - `chore:` - Maintenance (deps, configs, build)
   - `docs:` - Documentation only
   - `perf:` - Performance improvement
   - `refactor:` - Code change that neither fixes a bug nor adds a feature

4. **Optional scope**: If changes are focused on a specific area, use scope format:
   - `feat(tools):` - Changes to tools
   - `fix(api):` - API-related fixes
   - `chore(deps):` - Dependency updates

5. **Write the commit message**:
   - First line: `<type>: <concise description>` (max 72 chars)
   - Focus on the "why" not the "what"
   - Use imperative mood ("Add feature" not "Added feature")

6. **Create the commit** using HEREDOC format:
   ```bash
   git commit -m "$(cat <<'EOF'
   <type>: <description>

   🤖 Generated with [Claude Code](https://claude.ai/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   ```

7. **Verify** by running `git status` to confirm the commit succeeded.

## Examples from this repo

```
feat: Add document chunk indexing and person search (Phase 2+3)
fix: Add 500ms delay between API calls to avoid DIP rate limits
chore: Add coverage/ to .gitignore and remove from repo
docs: Add semantic search documentation to README
perf: Optimize indexer with skip logic, pipelining, larger batches
```

## Important

- Do NOT commit files that contain secrets (.env, credentials, API keys)
- If pre-commit hooks fail, fix the issues and try again
- Never use `--no-verify` or `--force` flags
