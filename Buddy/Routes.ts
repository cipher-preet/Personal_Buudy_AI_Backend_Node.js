import { Router } from "express";
import {
  createSpaceController,
  createStagedNoteController,
  createStagedTaskController,
  deleteSpaceController,
  deleteStagedNoteController,
  deleteStagedTaskController,
  getNoteDateMarkersBySpaceController,
  getNoteWorkspacesController,
  getProfileSummaryController,
  getSpaceStatsController,
  getStagedNoteByIdController,
  getStagedNotesBySpaceController,
  getStagedTasksBySpaceController,
  getTaskDateMarkersBySpaceController,
  gettranscriptchunkcontroller,
  getUserActiveSpaceController,
  getUserSpacesByUserIdController,
  startListningController,
  updateSpaceController,
  updateStagedNoteController,
  updateStagedTaskController,
  setStagedTaskStatusController,
} from "./Controllers/Home.Controller.js";
import {
  createReminderController,
  deleteReminderController,
  getRemindersController,
  updateReminderController,
} from "./Controllers/Reminder.Controller.js";
import {
  registerDeviceTokenController,
  unregisterDeviceTokenController,
} from "./Controllers/DeviceToken.Controller.js";
import {
  createCalendarEventController,
  deleteCalendarEventController,
  getCalendarEventDateMarkersController,
  getCalendarEventsController,
  updateCalendarEventController,
} from "./Controllers/CalendarEvent.Controller.js";
import { getCalendarFeedController } from "./Controllers/CalendarFeed.Controller.js";
import { streamConversationStatusEvents } from "./Services/ConversationStatusEvents.service.js";
import { getDailyBriefingController, forceGenerateDailyBriefingController } from "./Controllers/DailyBriefing.Controller.js";
import { submitFeedbackController } from "./Controllers/Feedback.Controller.js";
import { raiseSupportTicketController } from "./Controllers/SupportTicket.Controller.js";
import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";

const router = Router();

// router.use(requireAuth);

router.post("/create-space", createSpaceController);
router.post("/delete-space", requireAuth, deleteSpaceController);
router.post("/update-space", requireAuth, updateSpaceController);
router.get("/getuserspaces", getUserSpacesByUserIdController);
router.get("/getUserActiveSpace", getUserActiveSpaceController);
router.get(
  "/conversation-status-events",
  requireAuth,
  streamConversationStatusEvents,
);
router.get("/getSpaceStats", getSpaceStatsController);
router.get("/getProfileSummary", getProfileSummaryController);
router.get("/getNoteWorkspaces", getNoteWorkspacesController);
router.get("/getStagedNotesBySpace", getStagedNotesBySpaceController);
router.get("/getNoteDateMarkersBySpace", getNoteDateMarkersBySpaceController);
router.get("/getStagedNoteById", getStagedNoteByIdController);
router.post("/delete-staged-note", requireAuth, deleteStagedNoteController);
router.post("/create-staged-note", requireAuth, createStagedNoteController);
router.post("/update-staged-note", requireAuth, updateStagedNoteController);
router.get("/getStagedTasksBySpace", getStagedTasksBySpaceController);
router.get("/getTaskDateMarkersBySpace", getTaskDateMarkersBySpaceController);
router.post("/delete-staged-task", requireAuth, deleteStagedTaskController);
router.post("/create-staged-task", requireAuth, createStagedTaskController);
router.post("/update-staged-task", requireAuth, updateStagedTaskController);
router.post("/set-staged-task-status", requireAuth, setStagedTaskStatusController);
router.get("/getReminders", requireAuth, getRemindersController);
router.post("/create-reminder", requireAuth, createReminderController);
router.post("/update-reminder", requireAuth, updateReminderController);
router.post("/delete-reminder", requireAuth, deleteReminderController);
router.post("/register-device-token", requireAuth, registerDeviceTokenController);
router.post("/unregister-device-token", requireAuth, unregisterDeviceTokenController);
router.get("/getCalendarEvents", requireAuth, getCalendarEventsController);
router.get(
  "/getCalendarEventDateMarkers",
  requireAuth,
  getCalendarEventDateMarkersController,
);
router.get("/getCalendarFeed", requireAuth, getCalendarFeedController);
router.post("/create-calendar-event", requireAuth, createCalendarEventController);
router.post("/update-calendar-event", requireAuth, updateCalendarEventController);
router.post("/delete-calendar-event", requireAuth, deleteCalendarEventController);
router.get("/getDailyBriefing", requireAuth, getDailyBriefingController);
router.post(
  "/forceGenerateDailyBriefing",
  requireAuth,
  forceGenerateDailyBriefingController,
);
router.post("/submit-feedback", requireAuth, submitFeedbackController);
router.post(
  "/raise-support-ticket",
  requireAuth,
  raiseSupportTicketController,
);
router.post("/startListning", startListningController);



router.get("/gettranscriptchunk", gettranscriptchunkcontroller)

export default router;
