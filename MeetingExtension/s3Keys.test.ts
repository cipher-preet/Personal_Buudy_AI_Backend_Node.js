import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildChunkId,
  buildFinalRecordingS3Key,
  buildMeetingChunkS3Key,
} from "./s3Keys.js";

describe("meeting S3 keys", () => {
  it("builds a deterministic padded chunk key", () => {
    const key = buildMeetingChunkS3Key({
      prefix: "meetings",
      userId: "507f1f77bcf86cd799439011",
      meetingSessionId: "507f191e810c19729de860ea",
      sequence: 12,
      mimeType: "video/webm;codecs=vp8,opus",
    });
    assert.equal(
      key,
      "meetings/507f1f77bcf86cd799439011/507f191e810c19729de860ea/chunks/000012.webm",
    );
  });

  it("builds a stable chunk id", () => {
    assert.equal(
      buildChunkId("abc", 7),
      "meeting:abc:muxed:7",
    );
    assert.equal(
      buildChunkId("abc", 7, "audio"),
      "meeting:abc:audio:7",
    );
  });

  it("separates audio and video folders", () => {
    const audio = buildMeetingChunkS3Key({
      prefix: "meetings",
      userId: "user1",
      meetingSessionId: "sess1",
      sequence: 3,
      mimeType: "audio/webm",
      mediaKind: "audio",
    });
    const video = buildMeetingChunkS3Key({
      prefix: "meetings",
      userId: "user1",
      meetingSessionId: "sess1",
      sequence: 3,
      mimeType: "video/webm",
      mediaKind: "video",
    });
    assert.equal(audio, "meetings/user1/sess1/audio/000003.webm");
    assert.equal(video, "meetings/user1/sess1/video/000003.webm");
  });

  it("builds a final recording key", () => {
    assert.equal(
      buildFinalRecordingS3Key({
        prefix: "meetings",
        userId: "user1",
        meetingSessionId: "sess1",
      }),
      "meetings/user1/sess1/meeting.mp4",
    );
  });
});
