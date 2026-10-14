import { MeetingErrorCode } from "./constants.js";
import { MeetingError } from "./errors.js";

const SHA256_HEX = /^[a-f0-9]{64}$/i;

/** Absent checksums stay valid so older extension builds keep uploading. */
export const parseOptionalChecksum = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !SHA256_HEX.test(value.trim())) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      "checksum must be a SHA-256 hex digest.",
      400,
    );
  }
  return value.trim().toLowerCase();
};

export const resolveStoredChecksum = (
  existing: string | null,
  incoming: string | null,
): { store: string | null; conflict: boolean } => {
  if (existing && incoming && existing !== incoming) {
    return { store: existing, conflict: true };
  }
  return { store: existing || incoming, conflict: false };
};

/**
 * A repeated (session, sequence) with the same checksum is an ACK.
 * A different checksum must not replace the stored object.
 * Callers that omit checksum keep the original upload path.
 */
export const presignReuseDecision = (
  existingStatus: string | null,
  existingChecksum: string | null,
  incomingChecksum: string | null,
): "upload" | "ack" | "ack-conflict" => {
  if (existingStatus !== "UPLOADED" || !incomingChecksum) {
    return "upload";
  }
  return resolveStoredChecksum(existingChecksum, incomingChecksum).conflict ? "ack-conflict" : "ack";
};
