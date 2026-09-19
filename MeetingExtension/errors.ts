import type { MeetingErrorCode } from "./constants.js";

export class MeetingError extends Error {
  constructor(
    public readonly code: MeetingErrorCode,
    message: string,
    public readonly status: number,
    public readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MeetingError";
  }
}
