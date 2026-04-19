import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { SiweMessage } from "siwe";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { getAddress, isAddress } from "viem";
import { prisma, type Prisma } from "@repo/db";
import { NONCE_TTL_MS, SESSION_COOKIE, SESSION_TTL_MS } from "../constants.js";
import { parseChainId } from "../lib/chain.js";
import { createUserJwt } from "../lib/jwt.js";

const verifyBodySchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
});

export const authRoutes = new Hono();

authRoutes.get("/nonce", async (c) => {
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

authRoutes.post("/verify", async (c) => {
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

  const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.authNonce.update({
      where: { id: nonceRow.id },
      data: { used: true },
    });
    return tx.user.upsert({
      where: { address },
      create: { address },
      update: {},
    });
  });

  const jwt = await createUserJwt(user.id, address);
  const secure = process.env.NODE_ENV === "production";

  setCookie(c, SESSION_COOKIE, jwt, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return c.json({ ok: true, address });
});

authRoutes.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
