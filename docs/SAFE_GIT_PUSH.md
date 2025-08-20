# Safe Git Push Checklist (No Secrets)

Context

- Local embedded Groq key is statically imported at [src/llm/providers/GroqProvider.js](src/llm/providers/GroqProvider.js:8) and used in [GroqProvider._ensureKey()](src/llm/providers/GroqProvider.js:145).
- Template for local key: [src/llm/providers/GroqKey.example.js](src/llm/providers/GroqKey.example.js:1).
- Your real local file (git-ignored): [src/llm/providers/GroqKey.js](src/llm/providers/GroqKey.js:1), ignored by [.gitignore](.gitignore:153).
- Build docs: [README.md](README.md:133).

Pre-flight: verify no secrets are tracked

1. Confirm GroqKey.js is ignored by Git

```bash
git check-ignore -v src/llm/providers/GroqKey.js
# Expected output includes .gitignore:/path → src/llm/providers/GroqKey.js
```

2. Ensure GroqKey.js is NOT tracked

```bash
git ls-files --error-unmatch src/llm/providers/GroqKey.js 2>/dev/null || echo "Not tracked (OK)"
```

3. Scan working tree for obvious secrets

```bash
git grep -nE '(gsk_[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|EMBEDDED_KEY_B64|api[_-]?key)' -- ':!src/llm/providers/GroqKey.example.js' || echo "No obvious secrets found"
```

Build locally (dist zip will include the local key by design)

- Dist output is ignored by Git per [.gitignore](.gitignore:18).

```bash
npm run build
unzip -l dist/*.zip | grep -E 'src/llm/providers/GroqKey.js|manifest.json'
# Expect to see src/llm/providers/GroqKey.js listed inside the zip
```

Commit and push

```bash
git status
git add -A
git commit -m "chore: externalize Groq embedded key via local module; docs updated"
git push origin YOUR_BRANCH_NAME
```

Optional: run a local secret scan with Gitleaks
Homebrew:

```bash
brew install gitleaks
gitleaks detect -v
```

Docker:

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect -s /repo -v
```

Notes

- Do not commit [src/llm/providers/GroqKey.js](src/llm/providers/GroqKey.js:1). It is required in local builds and is intentionally included in your local zip, but never in Git history.
- If any secret is flagged, rotate it and scrub the commit before pushing.
- For CI-based scanning, ask to add a GitHub Actions workflow using Gitleaks.
