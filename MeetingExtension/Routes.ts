import { Router } from "express";

import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";
import {
  completeChunkController,
  createMeetingController,
  getMeetingController,
  getMeetingPlaybackController,
  getMeetingTranscriptController,
  listMeetingsController,
  presignChunkController,
  stopMeetingController,
} from "./Controllers/MeetingRecording.Controller.js";

const router = Router();

router.post("/", requireAuth, createMeetingController);
router.get("/", requireAuth, listMeetingsController);
router.get("/:sessionId", requireAuth, getMeetingController);
router.get("/:sessionId/transcript", requireAuth, getMeetingTranscriptController);
router.get("/:sessionId/playback", requireAuth, getMeetingPlaybackController);
router.post("/:sessionId/chunks/presign", requireAuth, presignChunkController);
router.post(
  "/:sessionId/chunks/:sequence/complete",
  requireAuth,
  completeChunkController,
);
router.post("/:sessionId/stop", requireAuth, stopMeetingController);

export default router;
