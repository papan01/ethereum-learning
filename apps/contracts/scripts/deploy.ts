import "@nomicfoundation/hardhat-viem";
import { network } from "hardhat";
import { isAddress, zeroAddress, type Address } from "viem";

async function main() {
  const { viem } = await network.connect();

  const walletClients = await viem.getWalletClients();
  const deployerAddress = walletClients[0]?.account?.address ?? "0x";

  const ownerEnv = process.env.LEARNING_VAULT_OWNER?.trim();
  const initialOwner: Address =
    ownerEnv && isAddress(ownerEnv) ? (ownerEnv as Address) : zeroAddress;

  const vault = await viem.deployContract("LearningVault", [initialOwner]);

  console.log("LearningVault deployed to:", vault.address);
  console.log("Deployer:", deployerAddress);
  console.log(
    "Constructor initialOwner arg:",
    initialOwner === zeroAddress
      ? "0x0000… (owner defaults to deployer)"
      : initialOwner,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
