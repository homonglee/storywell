import { postgresDatabase } from "./postgres-database";
import type { RuntimeBindings } from "./runtime-types";
// Next.js uses this adapter. The Sites Vite config resolves this module to sites-runtime.ts.
export const env: RuntimeBindings = {
  IS_VERCEL: true,
  get DB() { return postgresDatabase(); },
  get OPENAI_API_KEY() { return process.env.OPENAI_API_KEY; },
  get OPENAI_MODEL() { return process.env.OPENAI_MODEL; },
};
