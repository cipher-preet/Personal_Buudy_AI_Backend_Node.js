import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deliveryTypeFromFlags, normalizeDeliveryFlags } from "./delivery.js";

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

  it("maps legacy notification-only to ALARM_NOTIFICATION", () => {
    assert.equal(
      deliveryTypeFromFlags({
        aiCalling: false,
        beeping: false,
        notification: true,
      }),
      "ALARM_NOTIFICATION",
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

describe("normalizeDeliveryFlags", () => {
  it("forces notification false and defaults to beeping", () => {
    assert.deepEqual(
      normalizeDeliveryFlags({
        aiCalling: false,
        beeping: false,
        notification: true,
      }),
      { aiCalling: false, beeping: true, notification: false },
    );
  });

  it("keeps buddy call without forcing beeping", () => {
    assert.deepEqual(
      normalizeDeliveryFlags({
        aiCalling: true,
        beeping: false,
        notification: false,
      }),
      { aiCalling: true, beeping: false, notification: false },
    );
  });
});
