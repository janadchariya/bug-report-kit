# For coding agents

This repository is a source feature kit, not an app; there is no package.json.
Read README.md, INTEGRATION.md, DECISIONS.md and TOKENS.md before editing or installing.

- Survey the host's auth, permissions, database, UI, tokens and notifications first.
- Copy src/ contents into the host root (app/ and src/); db/ holds schema/migrations.
- reference/ mirrors host paths and implements documented seams; examples/ shows wiring.
- Keep Sales R19.1 behaviour and layout; map host colours through tokens.
- Tests stay beside feature layers; tests/ holds extra seam, DB and e2e acceptance tests.
- Run checks in an isolated host with a disposable database, never as a standalone kit.
- Keep this public repository free of real users, credentials and private infrastructure.
- Record every source deviation in CHANGELOG.md. Keep AGENTS.md and CLAUDE.md identical.
