import { env as bindings } from "cloudflare:workers";
import type { RuntimeBindings } from "./runtime-types";
export const env: RuntimeBindings = {
  IS_VERCEL: false,
  get DB() { return bindings.DB; },
  get OPENAI_API_KEY() { return bindings.OPENAI_API_KEY; },
  get OPENAI_MODEL() { return bindings.OPENAI_MODEL; },
};
