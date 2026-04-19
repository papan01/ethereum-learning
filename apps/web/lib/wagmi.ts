import { http, createConfig } from "wagmi";
import { hardhat, mainnet, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const chainId = Number.parseInt(process.env.NEXT_PUBLIC_SIWE_CHAIN_ID ?? "31337", 10);

const selectedChain =
  chainId === mainnet.id ? mainnet : chainId === sepolia.id ? sepolia : hardhat;

export const wagmiConfig = createConfig({
  chains: [selectedChain],
  connectors: [injected()],
  transports: {
    [hardhat.id]: http(process.env.NEXT_PUBLIC_HARDHAT_RPC_URL ?? "http://127.0.0.1:8545"),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
  ssr: true,
});
