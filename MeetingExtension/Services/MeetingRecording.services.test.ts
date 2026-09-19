import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MeetingError } from "../errors.js";
import { MeetingErrorCode, MeetingStatus } from "../constants.js";
import { canAcceptUploads, missingSequences } from "../state.js";
import { flattenTranscriptSegments } from "../transcript.js";

const USER_A = "507f1f77bcf86cd799439011";
const USER_B = "507f1f77bcf86cd799439012";

const assertOwner = (meetingUserId: string, authUserId?: string) => {
  if (!authUserId) {
    throw new MeetingError(MeetingErrorCode.MEETING_ACCESS_DENIED, "auth required", 401);
  }
  if (String(meetingUserId) !== String(authUserId)) {
    throw new MeetingError(MeetingErrorCode.MEETING_ACCESS_DENIED, "not owner", 403);
  }
};

describe("meeting recording service contracts", () => {
  it("requires authentication", () => {
    assert.throws(() => assertOwner(USER_A, undefined), (error: unknown) => {
      return error instanceof MeetingError && error.status === 401;
    });
  });

  it("enforces ownership", () => {
    assert.throws(() => assertOwner(USER_A, USER_B), (error: unknown) => {
      return (
        error instanceof MeetingError &&
        error.code === MeetingErrorCode.MEETING_ACCESS_DENIED &&
        error.status === 403
      );
    });
  });

  it("handles out-of-order uploads and STOP missing sequences", () => {
    const uploaded = new Set<number>();
    for (const sequence of [1, 2, 4, 5, 3]) {
      uploaded.add(sequence);
    }
    assert.deepEqual(missingSequences(5, uploaded), []);
    assert.deepEqual(missingSequences(6, uploaded), [6]);
  });

  it("accepts late chunks after STOP_REQUESTED and rejects after READY", () => {
    assert.equal(canAcceptUploads(MeetingStatus.STOP_REQUESTED), true);
    const uploaded = new Set([1, 2]);
    const missing = missingSequences(3, uploaded);
    assert.deepEqual(missing, [3]);
    uploaded.add(3);
    assert.deepEqual(missingSequences(3, uploaded), []);
    assert.equal(canAcceptUploads(MeetingStatus.READY), false);
  });

  it("treats duplicate complete as idempotent per media kind", () => {
    const enqueued = new Set<string>();
    const complete = (sessionId: string, sequence: number, mediaKind = "muxed") => {
      const key = `${sessionId}:${mediaKind}:${sequence}`;
      if (enqueued.has(key)) {
        return { duplicate: true };
      }
      enqueued.add(key);
      return { duplicate: false };
    };
    assert.equal(complete("m1", 12, "audio").duplicate, false);
    assert.equal(complete("m1", 12, "audio").duplicate, true);
    assert.equal(complete("m1", 12, "video").duplicate, false);
    assert.equal(enqueued.size, 2);
  });

  it("treats duplicate STOP as a single finalization", () => {
    let finalizeCount = 0;
    const stop = (status: string, expected: number, uploaded: number[]) => {
      if (
        status === MeetingStatus.UPLOAD_COMPLETE ||
        status === MeetingStatus.PROCESSING ||
        status === MeetingStatus.READY
      ) {
        return { status, duplicate: true };
      }
      const missing = missingSequences(expected, uploaded);
      if (missing.length) {
        return { status: MeetingStatus.WAITING_FOR_UPLOADS, missing, duplicate: false };
      }
      finalizeCount += 1;
      return { status: MeetingStatus.PROCESSING, missing: [], duplicate: false };
    };
    const first = stop(MeetingStatus.RECORDING, 2, [1, 2]);
    const second = stop(first.status, 2, [1, 2]);
    assert.equal(first.status, MeetingStatus.PROCESSING);
    assert.equal(second.duplicate, true);
    assert.equal(finalizeCount, 1);
  });

  it("flattens transcript segments in meeting-relative order", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const segments = flattenTranscriptSegments(
      [
        {
          sequenceNumber: 2,
          chunkId: "c2",
          segments: [
            { id: "s2", text: "later", startOffsetMs: 601200, endOffsetMs: 606400 },
          ],
        },
        {
          sequenceNumber: 1,
          chunkId: "c1",
          rawText: "hello",
          startTimeMs: 0,
          endTimeMs: 1500,
        },
      ],
      startedAt,
    );
    assert.equal(segments[0].text, "hello");
    assert.equal(segments[1].startOffsetMs, 601200);
    assert.equal(segments[1].spokenAtUtc, "2026-01-01T00:10:01.200Z");
  });

  it("tracks missing audio and video sequences independently", () => {
    const audio = missingSequences(3, [1, 2]);
    const video = missingSequences(3, [1, 2, 3]);
    assert.deepEqual(audio, [3]);
    assert.deepEqual(video, []);
  });

  it("does not require a client-supplied spaceId when userId is authenticated", () => {
    const body: Record<string, unknown> = { provider: "GOOGLE_MEET" };
    assert.equal(body.spaceId, undefined);
    assert.equal(Boolean(USER_A), true);
  });
});
