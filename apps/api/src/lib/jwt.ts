import { SignJWT, jwtVerify } from "jose";
import { getAddress, isAddress } from "viem";
import { JWT_ALG, SESSION_TTL_MS } from "../constants.js";

function getJwtSecretKey(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 32) {
    return new TextEncoder().encode(s);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set to a string of at least 32 characters");
  }
  return new TextEncoder().encode("dev-insecure-jwt-secret-min-32-chars!");
}

export async function createUserJwt(userId: string, address: string): Promise<string> {
  const key = getJwtSecretKey();
  return new SignJWT({ addr: address })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + SESSION_TTL_MS))
    .sign(key);
}

export async function verifyJwt(token: string): Promise<{ sub: string; addr: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), {
      algorithms: [JWT_ALG],
    });
    const sub = payload.sub;
    const addr = payload.addr;
    if (typeof sub !== "string" || typeof addr !== "string" || !isAddress(addr)) {
      return null;
    }
    return { sub, addr: getAddress(addr) };
  } catch {
    return null;
  }
}
