# StoryWell release versions

- Display format: StoryWell Ver x.xx. The shared source of truth is lib/app-version.ts.
- Before every production build, scripts/run-framework.mjs calls prepareRelease(). A changed application-code fingerprint increments the version (2.01 → 2.02; 2.99 → 3.00). Unchanged rebuilds and documentation-only changes keep the version.
- Commit the generated lib/app-version.ts and release-state.json with the implementation after checks and the production build. Publish the archive from that same commit. If code changes again, rebuild first so the version and artifact remain aligned.
- Per the user's 2026-09-14 instruction, do not deploy to Vercel or push to GitHub branches that trigger Vercel without a separate explicit instruction. Publish only to the existing Sites source repository and Site, preserving its audience.
- The workspace header, login header, browser title and setup screen use the shared version.
- Find the exact source with git show v2.01. Sites publication counters are hosting history and are separate from the product release number.

## 2.01

Mobile: opening New Story from the hamburger menu closes the drawer and its backdrop, keeps the dialog above navigation, and restores focus to the menu button when closed.
