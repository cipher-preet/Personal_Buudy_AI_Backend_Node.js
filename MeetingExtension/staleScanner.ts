import { logMeetingEvent } from "./log.js";
import { meetingRecordingService } from "./Services/MeetingRecording.services.js";

let timer: ReturnType<typeof setInterval> | null = null;

export const startMeetingStaleScanner = () => {
  if (timer) {
    return;
  }
  const tick = async () => {
    try {
      const changed = await meetingRecordingService.scanStaleSessions();
      if (changed > 0) {
        logMeetingEvent("meeting_stale_sessions_marked", { count: changed });
      }
    } catch (error) {
      logMeetingEvent("meeting_stale_scan_failed", {
        message: error instanceof Error ? error.message : "scan failed",
      });
    }
  };
  void tick();
  timer = setInterval(() => {
    void tick();
  }, 60_000);
  timer.unref();
};
