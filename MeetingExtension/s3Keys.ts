const SAFE_ID = /^[A-Za-z0-9._=-]+$/;

export const sanitizeKeyPart = (value: string, fallback = "unknown") => {
  const cleaned = String(value || "")
    .replace(/[^A-Za-z0-9._=-]+/g, "-")
    .replace(/^[-./]+|[-./]+$/g, "");
  return cleaned || fallback;
};

export const assertSafeId = (value: string, label: string) => {
  if (!SAFE_ID.test(value)) {
    throw new Error(`Unsafe ${label}`);
  }
};

export const extensionFromMime = (mimeType: string) => {
  const normalized = mimeType.split(";", 1)[0].trim().toLowerCase();
  if (normalized === "video/mp4" || normalized === "audio/mp4") {
    return "mp4";
  }
  if (normalized === "audio/wav" || normalized === "audio/wave") {
    return "wav";
  }
  if (normalized === "audio/ogg" || normalized === "audio/opus") {
    return "ogg";
  }
  if (normalized === "audio/mpeg") {
    return "mp3";
  }
  return "webm";
};

const folderForKind = (mediaKind?: string) => {
  if (mediaKind === "audio") {
    return "audio";
  }
  if (mediaKind === "video") {
    return "video";
  }
  return "chunks";
};

export const buildMeetingChunkS3Key = ({
  prefix,
  userId,
  meetingSessionId,
  sequence,
  mimeType,
  mediaKind,
}: {
  prefix: string;
  userId: string;
  meetingSessionId: string;
  sequence: number;
  mimeType: string;
  mediaKind?: string;
}) => {
  assertSafeId(userId, "userId");
  assertSafeId(meetingSessionId, "meetingSessionId");
  const ext = extensionFromMime(mimeType);
  const seq = String(sequence).padStart(6, "0");
  return `${prefix}/${sanitizeKeyPart(userId)}/${sanitizeKeyPart(meetingSessionId)}/${folderForKind(mediaKind)}/${seq}.${ext}`;
};

export const buildFinalRecordingS3Key = ({
  prefix,
  userId,
  meetingSessionId,
}: {
  prefix: string;
  userId: string;
  meetingSessionId: string;
}) => {
  assertSafeId(userId, "userId");
  assertSafeId(meetingSessionId, "meetingSessionId");
  return `${prefix}/${sanitizeKeyPart(userId)}/${sanitizeKeyPart(meetingSessionId)}/meeting.mp4`;
};

export const buildChunkId = (
  meetingSessionId: string,
  sequence: number,
  mediaKind = "muxed",
) => `meeting:${meetingSessionId}:${mediaKind}:${sequence}`;
