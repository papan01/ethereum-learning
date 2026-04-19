import "./load-env.js";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

serve(
  {
    fetch: createApp().fetch,
    port,
  },
  (info) => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${info.port}`);
  },
);
