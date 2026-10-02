import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MeetingStatus } from "./constants.js";
import { canAcceptUploads, isLateRecordedChunk, missingSequences, toClientStatus } from "./state.js";

describe("meeting state helpers", () => {
  it("detects missing sequences without requiring upload order", () => {
    assert.deepEqual(missingSequences(5, [1, 2, 4, 5]), [3]);
  });

  it("allows late uploads after STOP_REQUESTED", () => {
    assert.equal(canAcceptUploads(MeetingStatus.STOP_REQUESTED), true);
    assert.equal(canAcceptUploads(MeetingStatus.WAITING_FOR_UPLOADS), true);
    assert.equal(canAcceptUploads(MeetingStatus.INTERRUPTED), true);
  });

  it("rejects new chunks after READY", () => {
    assert.equal(canAcceptUploads(MeetingStatus.READY), false);
    assert.equal(canAcceptUploads(MeetingStatus.FINALIZING), false);
  });

  it("still accepts chunks recorded before Stop once the meeting is READY", () => {
    const ready = { status: MeetingStatus.READY, expectedFinalSequence: 20 };
    assert.equal(isLateRecordedChunk(ready, 7), true);
    assert.equal(isLateRecordedChunk(ready, 21), false);
    assert.equal(isLateRecordedChunk({ status: MeetingStatus.READY, expectedFinalSequence: null }, 7), false);
    assert.equal(
      isLateRecordedChunk({ status: MeetingStatus.RECORDING, expectedFinalSequence: 20 }, 7),
      false,
    );
  });

  it("exposes a simplified client status contract", () => {
    const status = toClientStatus({
      status: MeetingStatus.WAITING_FOR_UPLOADS,
      transcriptStatus: "pending",
      intelligenceStatus: "not_started",
    });
    assert.equal(status.ready, false);
    assert.equal(status.uploadStatus, "waiting_for_uploads");
    assert.equal(status.recordingStatus, "WAITING_FOR_UPLOADS");
  });
});
