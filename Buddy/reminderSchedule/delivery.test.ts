import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deliveryTypeFromFlags } from "./delivery.js";

describe("deliveryTypeFromFlags", () => {
  it("prefers AI_CALL", () => {
    assert.equal(
      deliveryTypeFromFlags({
        aiCalling: true,
        beeping: true,
        notification: true,
      }),
      "AI_CALL",
    );
  });

  it("uses ALARM_NOTIFICATION when beeping", () => {
    assert.equal(
      deliveryTypeFromFlags({
        aiCalling: false,
        beeping: true,
        notification: true,
      }),
      "ALARM_NOTIFICATION",
    );
  });

  it("uses NORMAL_NOTIFICATION when only notification is on", () => {
    assert.equal(
      deliveryTypeFromFlags({
        aiCalling: false,
        beeping: false,
        notification: true,
      }),
      "NORMAL_NOTIFICATION",
    );
  });

  it("returns null when all delivery flags are off", () => {
    assert.equal(
      deliveryTypeFromFlags({
        aiCalling: false,
        beeping: false,
        notification: false,
      }),
      null,
    );
  });
});
