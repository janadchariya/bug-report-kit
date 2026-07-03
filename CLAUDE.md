# For AI coding agents

This repo is a **feature kit**, not an app. It contains a complete in-app
bug-reporting feature (schema + server logic + API routes + React UI +
tests) extracted from a production Next.js/Prisma project, packaged so an
agent can install it into a different codebase.

Read `README.md` (what it is + step-by-step install guide) and
`INTEGRATION.md` (the 8 external interfaces the code expects and how to
adapt each one) before touching any code.

Rules of thumb:
- Do not try to build/run this repo standalone — there is no package.json
  here by design. The code compiles only inside a host project.
- `src/` is the feature. `reference/` is working implementations of its
  external dependencies. `examples/` shows wiring. `tests/` are the
  acceptance criteria after porting.
- Survey the target project's conventions FIRST (auth, storage, response
  envelope, styling tokens, path aliases), then adapt the seams —
  don't port the source project's conventions into the target.
