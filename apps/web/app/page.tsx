"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SiweMessage } from "siwe";
import {
  useAccount, // 取得錢包地址
  useChainId, // 取得鏈id
  useConnect, // 連線metamask錢包
  useDisconnect, // 斷開連線metamask錢包
  useSignMessage, // 簽署訊息
} from "wagmi";
import { apiFetch } from "@/lib/api";
import { LearningVaultPanel } from "@/components/learning-vault-panel";

type MeResponse = { user: { address: string } | null };

export default function HomePage() {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync, isPending: isSignPending } = useSignMessage();

  const [me, setMe] = useState<MeResponse["user"] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const siweDomain = process.env.NEXT_PUBLIC_SIWE_DOMAIN;
  const siweUri = process.env.NEXT_PUBLIC_SIWE_URI;

  const refreshMe = useCallback(async () => {
    const res = await apiFetch("/me");
    if (!res.ok) {
      setMe(null);
      return;
    }
    const data = (await res.json()) as MeResponse;
    setMe(data.user);
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const injected = useMemo(
    () => connectors.find((c) => c.id === "injected"),
    [connectors],
  );

  const signIn = useCallback(async () => {
    if (!address) return;
    setError(null);
    setBusy(true);
    try {
      const nonceRes = await apiFetch(
        `/auth/nonce?address=${encodeURIComponent(address)}`,
      );
      if (!nonceRes.ok) {
        const err = (await nonceRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error ?? "Failed to fetch nonce");
      }
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const domain = siweDomain ?? window.location.host;
      const uri = siweUri ?? window.location.origin;

      const message = new SiweMessage({
        domain,
        address,
        statement: "Sign in with Ethereum to Ethereum Cathay.",
        uri,
        version: "1",
        chainId,
        nonce,
      });

      const prepared = message.prepareMessage();
      const signature = await signMessageAsync({ message: prepared });

      const verifyRes = await apiFetch("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ message: prepared, signature }),
      });

      if (!verifyRes.ok) {
        const err = (await verifyRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error ?? "Verification failed");
      }

      await refreshMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }, [address, chainId, refreshMe, signMessageAsync, siweDomain, siweUri]);

  const signOut = useCallback(async () => {
    setError(null);
    await apiFetch("/auth/logout", { method: "POST" });
    await refreshMe();
  }, [refreshMe]);

  return (
    <main>
      <h1>Ethereum Cathay</h1>
      <div className="actions">
        {!isConnected ? (
          <button
            type="button"
            disabled={!injected || isConnectPending}
            onClick={() => injected && connect({ connector: injected })}
          >
            {isConnectPending ? "Connecting…" : "Connect wallet"}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy || isSignPending}
              onClick={() => void signIn()}
            >
              {busy || isSignPending ? "Signing…" : "Sign-In with Ethereum"}
            </button>
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
            <button type="button" onClick={() => disconnect()}>
              Disconnect wallet
            </button>
          </>
        )}
      </div>

      {error ? (
        <div className="card">
          <strong>Error</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="card">
        <strong>Wallet</strong>
        <p>
          {isConnected && address ? <code>{address}</code> : "Not connected"}
        </p>
      </div>

      <div className="card">
        <strong>Session (JWT)</strong>
        {me === undefined ? (
          <p>Loading…</p>
        ) : me ? (
          <p>
            Signed in as <code>{me.address}</code>
          </p>
        ) : (
          <p>No active session (complete SIWE after connecting).</p>
        )}
      </div>

      <LearningVaultPanel />
    </main>
  );
}
