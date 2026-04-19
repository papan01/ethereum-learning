import "./load-env.js";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { SiweMessage } from "siwe";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { getAddress, isAddress } from "viem";
import { prisma, type Prisma } from "@repo/db";

const SESSION_COOKIE = "ec_session";
const NONCE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseChainId(): number {
  const raw = process.env.SIWE_CHAIN_ID ?? "31337";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error("Invalid SIWE_CHAIN_ID");
  }
  return n;
}

const verifyBodySchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
});

const app = new Hono();

const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

app.use(
  "*",
  cors({
    origin: webOrigin,
    allowHeaders: ["Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

app.get("/auth/nonce", async (c) => {
  const address = c.req.query("address");
  if (!address || !isAddress(address)) {
    return c.json({ error: "Invalid address" }, 400);
  }

  const checksumAddress = getAddress(address);
  const nonce = randomBytes(16).toString("hex");

  await prisma.authNonce.create({
    data: {
      address: checksumAddress,
      nonce,
      expiresAt: new Date(Date.now() + NONCE_TTL_MS),
    },
  });

  return c.json({ nonce });
});

app.post("/auth/verify", async (c) => {
  let body: z.infer<typeof verifyBodySchema>;
  try {
    body = verifyBodySchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid body" }, 400);
  }

  const siweMessage = new SiweMessage(body.message);

  try {
    await siweMessage.verify({ signature: body.signature });
  } catch {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const expectedChainId = parseChainId();
  if (Number(siweMessage.chainId) !== expectedChainId) {
    return c.json({ error: "Unexpected chain" }, 400);
  }

  const address = getAddress(siweMessage.address);
  const nonce = siweMessage.nonce;

  const nonceRow = await prisma.authNonce.findFirst({
    where: {
      address,
      nonce,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!nonceRow) {
    return c.json({ error: "Invalid or expired nonce" }, 401);
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const sessionExpires = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.authNonce.update({
      where: { id: nonceRow.id },
      data: { used: true },
    });

    const user = await tx.user.upsert({
      where: { address },
      create: { address },
      update: {},
    });

    await tx.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: sessionExpires,
      },
    });
  });

  const secure = process.env.NODE_ENV === "production";

  setCookie(c, SESSION_COOKIE, rawToken, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return c.json({ ok: true, address });
});

app.post("/auth/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const tokenHash = hashToken(token);
    await prisma.session.deleteMany({ where: { tokenHash } });
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/me", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    return c.json({ user: null }, 200);
  }

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ user: null }, 200);
  }

  return c.json({ user: { address: session.user.address } });
});

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${info.port}`);
  },
);
