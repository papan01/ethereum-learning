import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("InboxModule", (m) => {
  const inbox = m.contract("Inbox", ["Hi there!"]);
  return { inbox };
});
