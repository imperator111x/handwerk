import { env } from "cloudflare:workers";

/** Bindings und Variablen des Workers. */
export function cfEnv(): Env {
  return env as unknown as Env;
}
