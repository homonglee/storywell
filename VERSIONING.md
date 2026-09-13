# StoryWell release versions

- Display format: StoryWell Ver x.xx. The shared source of truth is lib/app-version.ts.
- This release is 2.01; its Git tag is v2.01. Each feature/fix release increments the last two digits (2.01 → 2.02). Documentation-only commits keep the product version.
- Commit the version with the implementation, run the required checks, and tag that exact commit. Push the release commit and tag to GitHub.
- Publish the same commit to Sites and Vercel. Do not reuse a release tag for different source.
- The workspace header, login header, browser title and setup screen use the shared version.
- Find the exact source with git show v2.01. Sites publication counters are hosting history and are separate from the product release number.

## 2.01

Mobile: opening New Story from the hamburger menu closes the drawer and its backdrop, keeps the dialog above navigation, and restores focus to the menu button when closed.
