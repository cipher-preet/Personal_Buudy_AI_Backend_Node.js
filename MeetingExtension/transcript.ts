export const flattenTranscriptSegments = (
  chunks: Array<Record<string, unknown>>,
  startedAt?: Date,
) => {
  const segments: Array<Record<string, unknown>> = [];
  for (const chunk of chunks) {
    const nested = Array.isArray(chunk.segments) ? chunk.segments : [];
    if (nested.length > 0) {
      for (const segment of nested as Array<Record<string, unknown>>) {
        const startOffsetMs = segment.startOffsetMs;
        segments.push({
          id:
            segment.id ||
            `${chunk.chunkId || chunk.sequenceNumber}:${segment.index ?? segments.length}`,
          text: segment.text || "",
          startOffsetMs,
          endOffsetMs: segment.endOffsetMs,
          spokenAtUtc: segment.spokenAtUtc || spokenAtUtc(startedAt, startOffsetMs),
          chunkSequence: chunk.sequenceNumber,
          speakerId: segment.speakerId ?? null,
          speakerLabel: segment.speakerLabel ?? null,
        });
      }
      continue;
    }
    if (!chunk.rawText) {
      continue;
    }
    segments.push({
      id: String(chunk.chunkId || chunk._id),
      text: chunk.rawText,
      startOffsetMs: chunk.startTimeMs ?? null,
      endOffsetMs: chunk.endTimeMs ?? null,
      spokenAtUtc: spokenAtUtc(startedAt, chunk.startTimeMs),
      chunkSequence: chunk.sequenceNumber,
      speakerId: null,
      speakerLabel: null,
    });
  }
  segments.sort(
    (left, right) => Number(left.startOffsetMs || 0) - Number(right.startOffsetMs || 0),
  );
  return segments;
};

const spokenAtUtc = (startedAt: Date | undefined, startOffsetMs: unknown) => {
  if (!startedAt || typeof startOffsetMs !== "number") {
    return null;
  }
  return new Date(startedAt.getTime() + startOffsetMs).toISOString();
};
