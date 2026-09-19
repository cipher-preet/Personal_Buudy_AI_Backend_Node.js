# Meeting Extension API

Authenticated Chrome-extension recording flow. All routes require Buddy `Authorization: Bearer <token>` (same HMAC token as the mobile app). `userId` in the body is ignored; ownership always comes from the token.

Feature flag: `MEETING_EXTENSION_ENABLED=true`. If false, these routes return `503` with `MEETING_EXTENSION_UNAVAILABLE`. Existing `/api/v1/home`, `/api/v1/auth`, and Python `/api/v1/conversations` / `/api/v1/speech` contracts are unchanged.

Canonical `sourceType`: `meeting_extension`.

## Flow

```
CREATE MEETING
  → PRESIGN AUDIO CHUNK and/or VIDEO CHUNK
  → PUT directly to S3
  → COMPLETE CHUNK (repeat independently per mediaKind)
  → STOP
  → upload missing audio and/or video sequences if returned
  → poll GET meeting
  → READY
```

Do not delete a local browser chunk after S3 PUT succeeds. Delete only after COMPLETE returns success.

## Endpoints

### POST /api/v1/meeting-recordings

Creates a meeting session and a Python `conversations` row with the **same ObjectId**.

Request:

```json
{
  "spaceId": "64f0...",
  "provider": "GOOGLE_MEET",
  "meetingUrl": "https://meet.google.com/abc-defg-hij",
  "meetingTitle": "Weekly sync",
  "startedAt": "2026-09-18T08:00:00.000Z",
  "recordingMimeType": "video/webm;codecs=vp8,opus",
  "extensionVersion": "1.0.0",
  "clientRequestId": "optional-idempotency-key"
}
```

`spaceId` is optional. Capture is owned by the authenticated `userId`. If `spaceId` is omitted, Node reuses the user's `Meetings` space, otherwise the oldest existing space, otherwise it creates a `Meetings` space. If `spaceId` is sent, it must belong to that user.

Response:

```json
{
  "success": true,
  "data": {
    "meetingSessionId": "64f0...",
    "spaceId": "64f0...",
    "status": "RECORDING",
    "chunkDurationMs": 20000
  }
}
```

### POST /api/v1/meeting-recordings/:sessionId/chunks/presign

Re-presign of the same sequence is allowed while the session accepts uploads. Repeated presign is not treated as an upload.

Request:

```json
{
  "sequence": 12,
  "mediaKind": "audio",
  "startOffsetMs": 220000,
  "endOffsetMs": 240000,
  "durationMs": 20000,
  "sizeBytes": 1848291,
  "mimeType": "audio/webm"
}
```

`mediaKind` is `audio`, `video`, or `muxed`. Omit it only for legacy mixed WebM (`video/webm` → `muxed`). Split capture must send `audio` and `video` separately; the same sequence number may exist on both tracks.

Response:

```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.amazonaws.com/...",
    "s3Key": "meetings/{userId}/{sessionId}/audio/000012.webm",
    "mediaKind": "audio",
    "expiresAt": "2026-09-18T08:15:00.000Z",
    "method": "PUT",
    "headers": { "Content-Type": "audio/webm" }
  }
}
```

Then `PUT uploadUrl` with the same `Content-Type`. AWS credentials never leave the backend.

### POST /api/v1/meeting-recordings/:sessionId/chunks/:sequence/complete

Verifies the object in S3, registers the chunk, and enqueues Python processing **once for audio/muxed only**. Video chunks are stored in S3 and are not sent through STT.

Request:

```json
{
  "s3Key": "meetings/{userId}/{sessionId}/audio/000012.webm",
  "mediaKind": "audio",
  "etag": "abc",
  "sizeBytes": 1848291,
  "startOffsetMs": 220000,
  "endOffsetMs": 240000,
  "durationMs": 20000
}
```

Uploads may complete out of order. Allowed session states: `RECORDING`, `STOP_REQUESTED`, `WAITING_FOR_UPLOADS`, `INTERRUPTED`. After `UPLOAD_COMPLETE` / `FINALIZING` / `READY`, only idempotent repeats of already-uploaded sequences succeed.

### POST /api/v1/meeting-recordings/:sessionId/stop

Does not finalize immediately.

Request:

```json
{
  "finalSequence": 246,
  "durationMs": 4938120,
  "endedAt": "2026-09-18T09:22:18.000Z"
}
```

If sequences `1..finalSequence` are incomplete:

```json
{
  "success": true,
  "data": {
    "meetingSessionId": "...",
    "status": "WAITING_FOR_UPLOADS",
    "missingSequences": [181, 205],
    "missingAudioSequences": [181, 205],
    "missingVideoSequences": [205]
  }
}
```

Audio completeness starts the existing STT/meeting pipeline. Video completeness stores/merges in S3 later. Muxed WebM fills both tracks.

When complete, Node marks the shared conversation `STOP_REQUESTED` and publishes `conversation.finalization.requested` so the existing Python drain + meeting pipeline runs.

Calling STOP twice does not start two finalizations.

### GET /api/v1/meeting-recordings

Paginated list for the authenticated user only (`?limit=20&cursor=`).

### GET /api/v1/meeting-recordings/:sessionId

Meeting metadata plus simplified client status:

```json
{
  "recordingStatus": "PROCESSING",
  "uploadStatus": "complete",
  "transcriptionStatus": "waiting",
  "processingStatus": "processing",
  "videoMergeStatus": "PENDING",
  "ready": false
}
```

### GET /api/v1/meeting-recordings/:sessionId/transcript

Segments sorted by `startOffsetMs` ASC. Timestamps are meeting-relative (not reset per chunk). `speakerId` is nullable; names are never guessed.

### GET /api/v1/meeting-recordings/:sessionId/playback

Short-lived signed GET URL for `finalRecordingS3Key`. Returns `409 MEETING_PLAYBACK_NOT_READY` until merge completes. Source chunks are never deleted by merge failure.

## Error codes

| Code | Typical status |
|------|----------------|
| MEETING_EXTENSION_UNAVAILABLE | 503 |
| MEETING_NOT_FOUND | 404 |
| MEETING_ACCESS_DENIED | 401/403 |
| MEETING_INVALID_STATE | 409 |
| MEETING_CHUNK_TOO_LARGE | 400 |
| MEETING_INVALID_SEQUENCE | 400 |
| MEETING_INVALID_MIME_TYPE | 400 |
| MEETING_CHUNK_NOT_FOUND_IN_S3 | 404 |
| MEETING_UPLOAD_PRESIGN_FAILED | 502 |
| MEETING_PLAYBACK_NOT_READY | 409 |
| MEETING_RATE_LIMITED | 429 |
| MEETING_SPACE_NOT_FOUND | 404 |

Envelope: `{ "success": false, "message": "...", "data": { "code": "..." } }`.

## S3 layout

```
meetings/{userId}/{meetingSessionId}/audio/000001.webm
meetings/{userId}/{meetingSessionId}/video/000001.webm
meetings/{userId}/{meetingSessionId}/chunks/000001.webm
meetings/{userId}/{meetingSessionId}/meeting.webm
```

Split capture uses `audio/` and `video/`. Legacy mixed WebM uses `chunks/`. Merge prefers `video/` and falls back to `chunks/`.

Prefix is configurable via `MEETING_S3_PREFIX`. Retention of source chunks is `MEETING_SOURCE_CHUNK_RETENTION_DAYS` (no automatic delete in this release).

## Queue

Complete publishes Redis stream `buddy:stt:jobs` (`meeting.video.chunk.ready`) — the same queue the mobile app uses.
STOP (when uploads complete) publishes `buddy:conversation:finalization`.
Optional merge: `buddy:meeting:video-merge`.

If `QUEUE_API_BASE_URL` + `QUEUE_API_SERVICE_TOKEN` are set, Node posts to Python Queue API instead of Redis XADD. Meeting jobs never use `REMINDER_REDIS_URL`.
