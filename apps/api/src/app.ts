import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";

export function createApp(): Hono {
  const app = new Hono();
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  app.use(
    "*",
    cors({
      origin: webOrigin,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: true,
    }),
  );

  app.route("/health", healthRoutes);
  app.route("/auth", authRoutes);
  app.route("/me", meRoutes);

  return app;
}
