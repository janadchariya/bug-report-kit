# A10 variant for coding agents

Read README.md, INTEGRATION.md, DECISIONS.md, SOURCE.md and VERIFICATION.md here.

- This variant preserves A10 Supabase/REST behavior; root Sales Drizzle/action rules apply only to the root kit.
- Copy src/. into host src/; @/* means host src/*. Never install both variants together.
- Host auth, access, DB client and shell contracts are explicit in INTEGRATION.md; there is no standalone app.
- Keep BUG_FIXERS empty in the public kit; configure trusted employee identities privately in the host. Test fixtures are synthetic only.
- Merge narrow reference exports; do not overwrite unrelated host utilities or session implementations.
- Record every source deviation in SOURCE.md and root CHANGELOG.md.
- Verify in an isolated host and disposable database. Never mutate production while validating this source kit.
- Keep this AGENTS.md identical to CLAUDE.md.
