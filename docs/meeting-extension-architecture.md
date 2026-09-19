# Meeting Extension — Architecture / Reuse Map

Inspection date: 2026-09-18

This document is the pre-implementation reuse map. The Chrome extension is an additive input source. Existing Buddy mobile APIs, collections, queues, and contracts are not replaced.

## 1. Reuse as-is

### Node
- `requireAuth` + HMAC bearer tokens (`MIddleware/Auth/Auth.middleware.ts`, `utils/authToken.ts`)
- Success/error envelopes (`Api/Success.ts`, `Api/Error.ts`)
- Shared Mongo (`Config/db.ts`, `MONGO_URI`)
- Space ownership via `spaces` (`Buddy/Modals/Home.Modal.ts`)
- Existing S3 client/config (`Config/s3.ts`) — avatar upload remains unchanged
- `ioredis` (new client on `REDIS_URL`, never `REMINDER_REDIS_URL`)
- `BUDDY_API_BASE` pattern for optional Python HTTP (not required on the hot path)

### Python
- Conversation document + STOP/drain state machine (`ConversationStatus`, `VALID_TRANSITIONS`)
- `transcript_chunks` / `audio_chunks` unique `(conversationId, sequenceNumber)`
- Redis Streams `EventEnvelope` producer/consumer
- STT router `transcribe_from_path_with_fallback` (Deepgram primary, Sarvam fallback)
- Meeting intelligence: Extract → Ledger → Consolidate → Verify → invariant gate
- Short/long path via existing incremental windows (`ENABLE_INCREMENTAL_MEETING_PROCESSING`)
- S3 download via `S3AudioStorage.download_file` / `head_object`
- Finalization + processing workers
- `diag_log` observability

## 2. Extension-specific adapters

- Node facade: authenticated `/api/v1/meeting-recordings/*`
- Node recording lifecycle (`MeetingSession`, `MeetingRecordingChunk`) separate from mobile conversation APIs
- Deterministic video S3 keys under `meetings/{userId}/{sessionId}/video/` (audio under `audio/`, legacy muxed under `chunks/`)
- Meeting audio/muxed jobs share the app STT stream `buddy:stt:jobs` on `REDIS_URL` (never `REMINDER_REDIS_URL`)
- FFmpeg audio extraction adapter (Python had no FFmpeg)
- Timestamp normalizer: `chunk.startOffsetMs + sttSeconds * 1000`
- Optional `sourceType=meeting_extension` on conversations so inactivity scanner does not auto-finalize extension recordings
- Optional transcript segment array on `transcript_chunks` for video sync UI

## 3. New code

- Node models, routes, validation, presign, complete, stop, read APIs, playback, stale scanner
- Node Redis publisher for meeting video jobs + conversation finalization events
- Python meeting video worker: download → FFmpeg → existing STT → persist → `transcript.ready`
- Python optional video concat job → `finalRecordingS3Key`
- Feature flag `MEETING_EXTENSION_ENABLED` wrapping **new routes only**
- New tests (existing tests are not rewritten)

## 4. Do not touch (mobile depends on it)

- `/api/v1/speech/*`, `/api/v1/conversations/*` request/response contracts
- Reminder Redis keys (`buddy:reminder:*`) and `REMINDER_REDIS_URL` isolation
- Avatar S3 key layout `profile-images/...`
- `speech_transcribe_queue` / `completed_speech_queue` payload shape
- Existing STT stream handler assumptions (`validate_conversation_audio_object_key`)
- Conversation transition table semantics for mobile recordings
- Meeting pipeline prompts/stages
- Existing `transcript_chunks` required fields / unique index

## 5. ID strategy

`meetingSessionId` **is** the Python `conversationId` (same Mongo ObjectId).

This lets the existing drain, windowing, and meeting pipeline load transcripts without a second identity map.

## 6. Queue flow

```
Extension
  → Node POST /meeting-recordings
      → resolve space from userId (optional spaceId)
      → insert conversations (sourceType=meeting_extension, status=RECORDING)
      → insert meeting_sessions
  → Node POST .../chunks/presign  → S3 PUT (audio/ or video/ or chunks/)
  → Node POST .../chunks/:seq/complete
      → verify S3 HEAD
      → audio/muxed: upsert meeting_recording_chunks + audio_chunks + pending transcript_chunks
        → XADD buddy:stt:jobs  (same stream as the mobile app)
      → video: store meeting_recording_chunks only (no STT)
  → Python STT worker (dispatches meeting_extension jobs)
      → audio chunks skip FFmpeg; muxed still extracts
      → transcribe_from_path_with_fallback
      → complete_transcript_chunk + segments/timestamps
      → XADD buddy:transcript:ready
  → Node POST .../stop
      → STOP_REQUESTED, missing audio vs video sequence check
      → audio complete: conversation STOP_REQUESTED + XADD buddy:conversation:finalization
      → video complete: XADD buddy:meeting:video-merge (later combine)
  → existing finalization + meeting_pipeline
```
