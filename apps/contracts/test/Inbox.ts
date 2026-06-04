import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

describe("Inbox", async function () {
  const { viem } = await network.create();

  it("Should set the initial message in constructor", async function () {
    const initialMessage = "Hello Hardhat";
    const inbox = await viem.deployContract("Inbox", [initialMessage]);

    assert.equal(await inbox.read.message(), initialMessage);
  });

  it("Should update message when setMessage is called", async function () {
    const inbox = await viem.deployContract("Inbox", ["Initial"]);
    const newMessage = "Updated message";

    await inbox.write.setMessage([newMessage]);

    assert.equal(await inbox.read.message(), newMessage);
  });
});