import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MeetingError } from "./errors.js";
import { parseOptionalChecksum, presignReuseDecision, resolveStoredChecksum } from "./checksum.js";

describe("meeting chunk checksum", () => {
  it("accepts a missing checksum for older clients", () => {
    assert.equal(parseOptionalChecksum(undefined), null);
    assert.equal(parseOptionalChecksum(""), null);
  });

  it("rejects a malformed checksum", () => {
    assert.throws(() => parseOptionalChecksum("abc"), MeetingError);
  });

  it("keeps the first checksum when a retry sends different bytes", () => {
    const first = "a".repeat(64);
    const second = "b".repeat(64);
    assert.deepEqual(resolveStoredChecksum(first, second), { store: first, conflict: true });
    assert.equal(presignReuseDecision("UPLOADED", first, second), "ack-conflict");
  });

  it("acks an identical retry without another upload", () => {
    const checksum = "c".repeat(64);
    assert.equal(presignReuseDecision("UPLOADED", checksum, checksum), "ack");
  });

  it("still uploads when the sequence has not been acknowledged", () => {
    assert.equal(presignReuseDecision("PRESIGNED", null, "d".repeat(64)), "upload");
    assert.equal(presignReuseDecision(null, null, null), "upload");
  });
});
