import { MeetingStatus, TERMINAL_REJECT_UPLOAD_STATUSES } from "./constants.js";

export const canAcceptUploads = (status: MeetingStatus) =>
  !TERMINAL_REJECT_UPLOAD_STATUSES.has(status);

export const missingSequences = (
  expectedFinalSequence: number,
  uploadedSequences: Iterable<number>,
  firstSequence = 1,
) => {
  const present = new Set(uploadedSequences);
  const missing: number[] = [];
  for (let sequence = firstSequence; sequence <= expectedFinalSequence; sequence += 1) {
    if (!present.has(sequence)) {
      missing.push(sequence);
    }
  }
  return missing;
};

export const toClientStatus = (session: {
  status: MeetingStatus;
  transcriptStatus?: string | null;
  intelligenceStatus?: string | null;
  videoMergeStatus?: string | null;
  uploadedChunks?: number;
  totalChunks?: number;
  processedChunks?: number;
  expectedFinalSequence?: number | null;
}) => {
  const ready = session.status === MeetingStatus.READY;
  let uploadStatus = "in_progress";
  if (
    session.status === MeetingStatus.UPLOAD_COMPLETE ||
    session.status === MeetingStatus.PROCESSING ||
    session.status === MeetingStatus.WAITING_FOR_TRANSCRIPTS ||
    session.status === MeetingStatus.FINALIZING ||
    session.status === MeetingStatus.READY
  ) {
    uploadStatus = "complete";
  } else if (session.status === MeetingStatus.WAITING_FOR_UPLOADS) {
    uploadStatus = "waiting_for_uploads";
  } else if (
    session.status === MeetingStatus.FAILED ||
    session.status === MeetingStatus.FINALIZATION_FAILED
  ) {
    uploadStatus = "failed";
  }

  let transcriptionStatus = session.transcriptStatus || "pending";
  if (session.status === MeetingStatus.WAITING_FOR_TRANSCRIPTS) {
    transcriptionStatus = "waiting";
  } else if (
    session.status === MeetingStatus.FINALIZING ||
    session.status === MeetingStatus.READY
  ) {
    transcriptionStatus = session.transcriptStatus || "completed";
  }

  let processingStatus = session.intelligenceStatus || "not_started";
  if (session.status === MeetingStatus.PROCESSING) {
    processingStatus = "processing";
  } else if (session.status === MeetingStatus.FINALIZING) {
    processingStatus = "finalizing";
  } else if (session.status === MeetingStatus.READY) {
    processingStatus = "completed";
  } else if (session.status === MeetingStatus.FINALIZATION_FAILED) {
    processingStatus = "finalization_failed";
  } else if (session.status === MeetingStatus.FAILED) {
    processingStatus = "failed";
  }

  return {
    recordingStatus: session.status,
    uploadStatus,
    transcriptionStatus,
    processingStatus,
    videoMergeStatus: session.videoMergeStatus || "NOT_STARTED",
    ready,
  };
};
