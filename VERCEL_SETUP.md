# StoryWell Ver2.0 on Vercel

- Team: Homong's projects (homongs-projects)
- Project: storywell
- Repository: homonglee/storywell, main
- Framework: Next.js; build: pnpm build:vercel; output: .next
- The existing Sites build and D1 data remain separate and unchanged.

## Required environment variables

Add these in Vercel Project Settings → Environment Variables for Production and Preview.

| Name | Value |
| --- | --- |
| STORYWELL_ACCESS_PASSWORD | A unique password of at least 16 characters, entered directly by the owner |
| DATABASE_URL | Connection string from the project's Neon/Postgres integration (POSTGRES_URL is also supported) |
| OPENAI_API_KEY | Your existing OpenAI key, entered directly in Vercel |
| OPENAI_MODEL | Optional; defaults to gpt-5.6-terra |

Do not put keys or passwords in chat, Git, or client-side NEXT_PUBLIC variables.
Until a strong password is configured, the deployment returns 503 and keeps the workspace/API closed.
Sign in with username storywell and the configured password. All API routes use the same gate; incoming Sites identity headers are replaced.
After adding the database, the application initializes its three tables on the first authorized database request with a transaction and advisory lock.
The connection uses validated TLS; project/history deletion remains atomic.

The new Postgres workspace does not automatically contain works from the Sites D1 database. Keep the original site until a separately verified data migration is complete.

## Deployment status

Production URL: https://storywell-amber.vercel.app
Initial deployment READY: e1bb32d, dpl_2JvFgTDn8pLL1r5dQhWbaVyy3rJi.
Workspace/API are intentionally closed with HTTP 503 until the owner configures the private password.
Neon Free database neon-amber-saddle is connected to storywell. DATABASE_URL and POSTGRES_URL are present (secret values not read). Owner-entered OPENAI_API_KEY and STORYWELL_ACCESS_PASSWORD are still pending; no authenticated Vercel data or AI generation has been tested yet.
Vercel plans now continue across requests (bible, then at most 20 chapters each). The request timeout is 270 seconds under the 300-second platform limit.
