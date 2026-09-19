import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPresignChunkUpdate } from "./MeetingChunk.repository.js";

describe("presign chunk upsert", () => {
  it("does not put the same path in both $set and $setOnInsert", () => {
    const { filter, update } = buildPresignChunkUpdate({
      meetingSessionId: "507f191e810c19729de860ea" as never,
      userId: "507f1f77bcf86cd799439011" as never,
      sequence: 1,
      mediaKind: "muxed",
      startOffsetMs: 0,
      endOffsetMs: 20_000,
      durationMs: 20_000,
      sizeBytes: 128,
      mimeType: "video/webm",
      s3Key: "meetings/user/session/chunks/000001.webm",
      uploadStatus: "PRESIGNED",
    });

    const setPaths = Object.keys(update.$set);
    const insertPaths = Object.keys(update.$setOnInsert);
    const overlap = setPaths.filter((path) => insertPaths.includes(path));

    assert.deepEqual(filter, {
      meetingSessionId: "507f191e810c19729de860ea",
      sequence: 1,
      mediaKind: "muxed",
    });
    assert.deepEqual(overlap, []);
    assert.equal(update.$setOnInsert.processingEnqueued, false);
    assert.equal(update.$set.uploadStatus, "PRESIGNED");
  });
});
