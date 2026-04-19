import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE } from "../constants.js";

export function getTokenFromRequest(c: Context): string | undefined {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  return getCookie(c, SESSION_COOKIE);
}
