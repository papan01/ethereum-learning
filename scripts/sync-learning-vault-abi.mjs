import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const artifactPath = path.join(
  repoRoot,
  "apps/contracts/artifacts/contracts/LearningVault.sol/LearningVault.json",
);
const outPath = path.join(repoRoot, "apps/web/lib/learningVaultAbi.ts");

if (!fs.existsSync(artifactPath)) {
  console.error(`Artifact not found: ${artifactPath}`);
  console.error("Run contract compile first (e.g. pnpm contracts:compile).");
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
if (!Array.isArray(artifact.abi)) {
  console.error("Invalid artifact: missing abi array.");
  process.exit(1);
}

const content = `/** Auto-generated from apps/contracts/artifacts/contracts/LearningVault.sol/LearningVault.json.
 * Do not edit manually; run \`pnpm abi:sync\`.
 */
export const learningVaultAbi = ${JSON.stringify(artifact.abi, null, 2)} as const;
`;

fs.writeFileSync(outPath, content);
console.log(`Synced ABI -> ${path.relative(repoRoot, outPath)}`);
