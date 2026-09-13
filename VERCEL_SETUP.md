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
Open /login and sign in with username storywell and the configured password. The server issues a signed, HttpOnly, Secure, SameSite=Lax cookie for seven days. Use the workspace logout button to clear it; save pending edits first. All API routes use the same gate; incoming Sites identity headers are replaced.
After adding the database, the application initializes its three tables on the first authorized database request with a transaction and advisory lock.
The connection uses validated TLS; project/history deletion remains atomic.

The new Postgres workspace does not automatically contain works from the Sites D1 database. Keep the original site until a separately verified data migration is complete.

## Deployment status

Production URL: https://storywell-amber.vercel.app
Initial deployment READY: e1bb32d, dpl_2JvFgTDn8pLL1r5dQhWbaVyy3rJi.
Password and API key are registered. The updated login flow redirects unauthenticated pages to /login and returns JSON 401 for protected APIs, without browser Basic Auth popups.
Neon Free database neon-amber-saddle is connected to storywell. DATABASE_URL and POSTGRES_URL are present (secret values not read). OPENAI_API_KEY and STORYWELL_ACCESS_PASSWORD are present (values not read). Authenticated Vercel data and AI generation checks are pending the owner browser login.
Vercel plans now continue across requests (bible, then at most 20 chapters each). The request timeout is 270 seconds under the 300-second platform limit.

Latest verified production redeploy: dpl_3tQrHf9KSFsrgtYfha8ND2fBpDDa, source 3184725, READY at 2026-09-13 19:46:51 KST.

Login regression checks: node --test scripts/test-workspace-controls.cjs (37 tests), then pnpm build:vercel and node scripts/test-login-http.cjs. The HTTP test uses dummy credentials and no production database or AI calls.
