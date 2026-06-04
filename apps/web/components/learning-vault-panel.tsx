"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useTransactionCount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, formatGwei, isAddress, parseEther, type Transaction } from "viem";
import { learningVaultAbi } from "@/lib/learningVaultAbi";

function parseEthInput(raw: string): bigint {
  const t = raw.trim();
  if (t === "") {
    throw new Error("Enter an amount");
  }
  return parseEther(t);
}

export function LearningVaultPanel() {
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const [depositStr, setDepositStr] = useState("0.01");
  const [withdrawStr, setWithdrawStr] = useState("0.01");
  const [nonceLookupAddress, setNonceLookupAddress] = useState("");
  const [nonceLookupError, setNonceLookupError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const vaultAddressRaw = process.env.NEXT_PUBLIC_LEARNING_VAULT_ADDRESS;
  const vaultAddress = useMemo(() => {
    const v = vaultAddressRaw?.trim();
    return v && isAddress(v) ? v : undefined;
  }, [vaultAddressRaw]);

  const expectedChainId = Number.parseInt(
    process.env.NEXT_PUBLIC_SIWE_CHAIN_ID ?? "31337",
    10,
  );
  const chainOk = chainId === expectedChainId;

  const enabled = Boolean(vaultAddress && isConnected && address && chainOk);

  const { data: paused, refetch: refetchPaused } = useReadContract({
    address: vaultAddress,
    abi: learningVaultAbi,
    functionName: "paused",
    query: { enabled: Boolean(vaultAddress) },
  });

  const { data: vaultBalance, refetch: refetchVaultBalance } = useReadContract({
    address: vaultAddress,
    abi: learningVaultAbi,
    functionName: "totalEthHeld",
    query: { enabled: Boolean(vaultAddress) },
  });

  const { data: userBookBalance, refetch: refetchUserBalance } = useReadContract({
    address: vaultAddress,
    abi: learningVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(vaultAddress && address) },
  });

  const { data: connectedWalletNonce, refetch: refetchConnectedWalletNonce } =
    useTransactionCount({
      address,
      query: { enabled: Boolean(address && chainOk) },
    });

  const lookupAddress = useMemo(() => {
    const trimmed = nonceLookupAddress.trim();
    return trimmed && isAddress(trimmed) ? trimmed : undefined;
  }, [nonceLookupAddress]);

  const { data: lookupWalletNonce, refetch: refetchLookupWalletNonce } =
    useTransactionCount({
      address: lookupAddress,
      query: { enabled: Boolean(lookupAddress && chainOk) },
    });

  const {
    data: hash,
    writeContract,
    isPending: isWritePending,
    error: writeError,
  } = useWriteContract();

  const [txDetails, setTxDetails] = useState<Transaction | null>(null);
  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  const txGasUsed = receipt?.gasUsed;
  const txEffectiveGasPrice = receipt?.effectiveGasPrice;
  const txFeeWei =
    txGasUsed !== undefined && txEffectiveGasPrice !== undefined
      ? txGasUsed * txEffectiveGasPrice
      : undefined;

  useEffect(() => {
    if (!hash || !publicClient) {
      setTxDetails(null);
      return;
    }

    let cancelled = false;
    void publicClient
      .getTransaction({ hash })
      .then((tx) => {
        if (!cancelled) {
          setTxDetails(tx);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTxDetails(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hash, publicClient]);

  const refreshReads = useCallback(async () => {
    await Promise.all([
      refetchPaused(),
      refetchVaultBalance(),
      refetchUserBalance(),
      refetchConnectedWalletNonce(),
      refetchLookupWalletNonce(),
    ]);
  }, [
    refetchPaused,
    refetchVaultBalance,
    refetchUserBalance,
    refetchConnectedWalletNonce,
    refetchLookupWalletNonce,
  ]);

  useEffect(() => {
    if (isConfirmed) {
      void refreshReads();
    }
  }, [isConfirmed, refreshReads]);

  const busy = isWritePending || isConfirming;

  const onDeposit = useCallback(() => {
    if (!vaultAddress || !enabled) return;
    setFormError(null);
    try {
      const value = parseEthInput(depositStr);
      if (value <= 0n) {
        throw new Error("Amount must be greater than 0");
      }
      writeContract({
        address: vaultAddress,
        abi: learningVaultAbi,
        functionName: "deposit",
        value,
      });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Invalid amount");
    }
  }, [vaultAddress, enabled, depositStr, writeContract]);

  const onWithdraw = useCallback(() => {
    if (!vaultAddress || !enabled) return;
    setFormError(null);
    try {
      const amount = parseEthInput(withdrawStr);
      if (amount <= 0n) {
        throw new Error("Amount must be greater than 0");
      }
      writeContract({
        address: vaultAddress,
        abi: learningVaultAbi,
        functionName: "withdraw",
        args: [amount],
      });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Invalid amount");
    }
  }, [vaultAddress, enabled, withdrawStr, writeContract]);

  const onLookupNonce = useCallback(() => {
    setNonceLookupError(null);
    const trimmed = nonceLookupAddress.trim();
    if (trimmed === "") {
      setNonceLookupError("Enter an address to lookup nonce");
      return;
    }
    if (!isAddress(trimmed)) {
      setNonceLookupError("Invalid address format");
      return;
    }
    void refetchLookupWalletNonce();
  }, [nonceLookupAddress, refetchLookupWalletNonce]);

  if (!vaultAddressRaw?.trim()) {
    return (
      <div className="card">
        <strong>LearningVault</strong>
        <p>Set <code>NEXT_PUBLIC_LEARNING_VAULT_ADDRESS</code> in <code>.env</code> to use deposit / withdraw.</p>
      </div>
    );
  }

  if (!vaultAddress) {
    return (
      <div className="card">
        <strong>LearningVault</strong>
        <p><code>NEXT_PUBLIC_LEARNING_VAULT_ADDRESS</code> is not a valid address.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <strong>LearningVault</strong>
      <p className="vault-meta">
        Contract <code className="vault-addr">{vaultAddress}</code>
      </p>

      {!isConnected ? (
        <p>Connect your wallet to deposit or withdraw.</p>
      ) : !chainOk ? (
        <p className="vault-warning">
          Switch the wallet to chain ID <code>{expectedChainId}</code> (currently {chainId}).
        </p>
      ) : paused ? (
        <p className="vault-warning">Vault is paused — deposits and withdrawals are disabled on-chain.</p>
      ) : null}

      <div className="vault-stats">
        <div>
          <span className="vault-label">Your book balance</span>
          <span className="vault-value">
            {userBookBalance !== undefined
              ? `${formatEther(userBookBalance)} ETH`
              : "—"}
          </span>
        </div>
        <div>
          <span className="vault-label">ETH in contract</span>
          <span className="vault-value">
            {vaultBalance !== undefined ? `${formatEther(vaultBalance)} ETH` : "—"}
          </span>
        </div>
        <div>
          <span className="vault-label">Your tx nonce</span>
          <span className="vault-value">
            {connectedWalletNonce !== undefined
              ? connectedWalletNonce.toString()
              : "—"}
          </span>
        </div>
      </div>

      <div className="vault-actions">
        <div className="vault-field">
          <label htmlFor="deposit-eth">Deposit (ETH)</label>
          <input
            id="deposit-eth"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={depositStr}
            onChange={(e) => setDepositStr(e.target.value)}
            disabled={!enabled || busy || paused}
          />
          <button
            type="button"
            disabled={!enabled || busy || paused}
            onClick={() => void onDeposit()}
          >
            {isWritePending
              ? "Confirm in wallet…"
              : isConfirming
                ? "Confirming…"
                : "Deposit"}
          </button>
        </div>
        <div className="vault-field">
          <label htmlFor="withdraw-eth">Withdraw (ETH)</label>
          <input
            id="withdraw-eth"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={withdrawStr}
            onChange={(e) => setWithdrawStr(e.target.value)}
            disabled={!enabled || busy || paused}
          />
          <button
            type="button"
            disabled={!enabled || busy || paused}
            onClick={() => void onWithdraw()}
          >
            {isWritePending
              ? "Confirm in wallet…"
              : isConfirming
                ? "Confirming…"
                : "Withdraw"}
          </button>
        </div>
      </div>

      {formError ? (
        <p className="vault-error" role="alert">
          {formError}
        </p>
      ) : null}
      {writeError ? (
        <p className="vault-error" role="alert">
          {writeError.message}
        </p>
      ) : null}
      <div className="vault-lookup">
        <label htmlFor="nonce-address">Lookup address nonce</label>
        <div className="vault-lookup-row">
          <input
            id="nonce-address"
            type="text"
            placeholder="0x..."
            autoComplete="off"
            value={nonceLookupAddress}
            onChange={(e) => setNonceLookupAddress(e.target.value)}
          />
          <button type="button" onClick={() => void onLookupNonce()}>
            Check nonce
          </button>
        </div>
        {lookupAddress && chainOk ? (
          <p className="vault-lookup-result">
            Nonce:{" "}
            <code>{lookupWalletNonce !== undefined ? lookupWalletNonce.toString() : "..."}</code>
          </p>
        ) : null}
        {nonceLookupError ? (
          <p className="vault-error" role="alert">
            {nonceLookupError}
          </p>
        ) : null}
      </div>
      {hash ? (
        <div className="vault-tx-wrap">
          <p className="vault-tx">
            Tx: <code>{hash}</code>
            {isConfirming ? " (confirming…)" : isConfirmed ? " (confirmed)" : null}
          </p>
          {txGasUsed !== undefined ? (
            <div className="vault-tx-gas">
              <div>
                <span className="vault-label">Gas used</span>
                <span className="vault-value">
                  {txGasUsed.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="vault-label">Effective gas price</span>
                <span className="vault-value">
                  {txEffectiveGasPrice !== undefined
                    ? `${formatGwei(txEffectiveGasPrice)} gwei`
                    : "—"}
                </span>
              </div>
              <div>
                <span className="vault-label">Total tx fee</span>
                <span className="vault-value">
                  {txFeeWei !== undefined ? `${formatEther(txFeeWei)} ETH` : "—"}
                </span>
              </div>
            </div>
          ) : null}
          {txDetails ? (
            <div className="vault-tx-raw">
              <div>
                <span className="vault-label">From</span>
                <code>{txDetails.from}</code>
              </div>
              <div>
                <span className="vault-label">To</span>
                <code>{txDetails.to ?? "contract creation"}</code>
              </div>
              <div>
                <span className="vault-label">Value</span>
                <span className="vault-value">{formatEther(txDetails.value)} ETH</span>
              </div>
              <div>
                <span className="vault-label">Nonce</span>
                <span className="vault-value">{txDetails.nonce.toString()}</span>
              </div>
              <div>
                <span className="vault-label">Gas limit</span>
                <span className="vault-value">{txDetails.gas.toString()}</span>
              </div>
              <div>
                <span className="vault-label">Gas price</span>
                <span className="vault-value">
                  {txDetails.gasPrice !== undefined
                    ? `${formatGwei(txDetails.gasPrice)} gwei`
                    : "—"}
                </span>
              </div>
              <div>
                <span className="vault-label">Max fee per gas</span>
                <span className="vault-value">
                  {txDetails.maxFeePerGas !== undefined
                    ? `${formatGwei(txDetails.maxFeePerGas)} gwei`
                    : "—"}
                </span>
              </div>
              <div>
                <span className="vault-label">Priority fee</span>
                <span className="vault-value">
                  {txDetails.maxPriorityFeePerGas !== undefined
                    ? `${formatGwei(txDetails.maxPriorityFeePerGas)} gwei`
                    : "—"}
                </span>
              </div>
              <div>
                <span className="vault-label">Type</span>
                <span className="vault-value">{txDetails.type}</span>
              </div>
              <div>
                <span className="vault-label">Chain ID</span>
                <span className="vault-value">
                  {txDetails.chainId !== undefined
                    ? txDetails.chainId.toString()
                    : chainId.toString()}
                </span>
              </div>
              <div className="vault-tx-data">
                <span className="vault-label">Data</span>
                <code>{txDetails.input}</code>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
