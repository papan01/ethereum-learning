import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import { SESSION_COOKIE } from "../constants.js";
import { getTokenFromRequest } from "../lib/auth-token.js";
import { verifyJwt } from "../lib/jwt.js";

export const meRoutes = new Hono();

meRoutes.get("/", async (c) => {
  const token = getTokenFromRequest(c);
  if (!token) {
    return c.json({ user: null }, 200);
  }

  const payload = await verifyJwt(token);
  if (!payload) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ user: null }, 200);
  }

  return c.json({ user: { address: payload.addr } });
});
