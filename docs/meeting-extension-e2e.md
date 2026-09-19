# Manual local E2E (Chrome extension → Node → S3 → Python)

Prereqs:

1. Node `MEETING_EXTENSION_ENABLED=true`, `REDIS_URL` points at the same Redis as Python, `AWS_*` / `AWS_S3_BUCKET` set.
2. Python worker running (`python -m apps.api_gateway.workers.main`) with `MEETING_EXTENSION_ENABLED=true` and FFmpeg available (`ffmpeg` on PATH, `MEETING_FFMPEG_BIN`, or the bundled `imageio-ffmpeg` binary).
3. Buddy user token from `POST /api/v1/auth/login` (or Google).
4. Auth is enough. `spaceId` is optional (`GET /api/v1/home/getuserspaces` only if you want a specific space).

Steps:

```bash
TOKEN=...
BASE=http://localhost:5000/api/v1

# 1. create
curl -s -X POST $BASE/meeting-recordings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"provider\":\"GOOGLE_MEET\",\"recordingMimeType\":\"video/webm\"}"

# 2. presign sequence 1
# 3. PUT the webm bytes to uploadUrl with Content-Type: video/webm
# 4. POST .../chunks/1/complete with s3Key + offsets
# 5. Repeat for sequence 2 (optionally complete 2 before 1)
# 6. POST .../stop {"finalSequence":2,"durationMs":40000}
# 7. If missingSequences, complete those chunks
# 8. GET .../:id until recordingStatus=READY
# 9. GET .../:id/transcript
```

Do not call paid STT/LLMs from unit tests. This script is manual and optional.
