import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { MeetingError } from "./errors.js";
import {
  assertAllowedMimeType,
  parseChunkTiming,
  parseMediaKind,
  parseProvider,
  parseSequence,
  parseSizeBytes,
} from "./validation.js";
import { getMeetingConfig } from "./config.js";

describe("meeting validation", () => {
  it("rejects invalid MIME types", () => {
    assert.throws(() => assertAllowedMimeType("application/pdf"), MeetingError);
  });

  it("accepts video/webm with codec suffix", () => {
    assert.equal(assertAllowedMimeType("video/webm;codecs=vp8,opus"), "video/webm");
  });

  it("rejects oversize chunks", () => {
    const config = getMeetingConfig();
    assert.throws(
      () => parseSizeBytes(config.chunkMaxSizeBytes + 1, config),
      (error: unknown) =>
        error instanceof MeetingError && error.code === "MEETING_CHUNK_TOO_LARGE",
    );
  });

  it("rejects endOffset before startOffset", () => {
    assert.throws(
      () =>
        parseChunkTiming(
          { startOffsetMs: 200, endOffsetMs: 100, durationMs: 20 },
          getMeetingConfig(),
        ),
      MeetingError,
    );
  });

  it("rejects sequence 0", () => {
    assert.throws(() => parseSequence(0), MeetingError);
  });

  it("parses known providers", () => {
    assert.equal(parseProvider("google_meet"), "GOOGLE_MEET");
    assert.equal(parseProvider(undefined), "UNKNOWN");
  });

  it("infers mediaKind from MIME and explicit values", () => {
    assert.equal(parseMediaKind(undefined, "audio/webm"), "audio");
    assert.equal(parseMediaKind(undefined, "video/webm"), "muxed");
    assert.equal(parseMediaKind("video", "video/webm"), "video");
    assert.throws(() => parseMediaKind("video", "audio/webm"), MeetingError);
  });

  it("publishes meeting audio onto the app STT stream using REDIS_URL", () => {
    const previousStt = process.env.REDIS_STT_STREAM;
    const previousMeeting = process.env.REDIS_MEETING_VIDEO_STREAM;
    delete process.env.REDIS_STT_STREAM;
    process.env.REDIS_MEETING_VIDEO_STREAM = "buddy:meeting:video-chunks";
    try {
      assert.equal(getMeetingConfig().meetingVideoStream, "buddy:stt:jobs");
    } finally {
      if (previousStt === undefined) {
        delete process.env.REDIS_STT_STREAM;
      } else {
        process.env.REDIS_STT_STREAM = previousStt;
      }
      if (previousMeeting === undefined) {
        delete process.env.REDIS_MEETING_VIDEO_STREAM;
      } else {
        process.env.REDIS_MEETING_VIDEO_STREAM = previousMeeting;
      }
    }

    const queueSource = readFileSync(
      fileURLToPath(new URL("./queue.ts", import.meta.url)),
      "utf8",
    );
    assert.match(queueSource, /REDIS_URL is not configured for meeting extension jobs/);
    assert.doesNotMatch(queueSource, /REMINDER_REDIS_URL/);
  });
});
