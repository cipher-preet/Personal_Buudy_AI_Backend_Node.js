import { Router } from "express";
import {
  createSpaceController,
  createStagedNoteController,
  createStagedTaskController,
  deleteSpaceController,
  deleteStagedNoteController,
  deleteStagedTaskController,
  getNoteWorkspacesController,
  getProfileSummaryController,
  getSpaceStatsController,
  getStagedNoteByIdController,
  getStagedNotesBySpaceController,
  getStagedTasksBySpaceController,
  gettranscriptchunkcontroller,
  getUserActiveSpaceController,
  getUserSpacesByUserIdController,
  startListningController,
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
  getCalendarEventsController,
  updateCalendarEventController,
} from "./Controllers/CalendarEvent.Controller.js";
import { streamConversationStatusEvents } from "./Services/ConversationStatusEvents.service.js";
import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";

const router = Router();

// router.use(requireAuth);

router.post("/create-space", createSpaceController);
router.post("/delete-space", requireAuth, deleteSpaceController);
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
router.get("/getStagedNoteById", getStagedNoteByIdController);
router.post("/delete-staged-note", requireAuth, deleteStagedNoteController);
router.post("/create-staged-note", requireAuth, createStagedNoteController);
router.get("/getStagedTasksBySpace", getStagedTasksBySpaceController);
router.post("/delete-staged-task", requireAuth, deleteStagedTaskController);
router.post("/create-staged-task", requireAuth, createStagedTaskController);
router.get("/getReminders", requireAuth, getRemindersController);
router.post("/create-reminder", requireAuth, createReminderController);
router.post("/update-reminder", requireAuth, updateReminderController);
router.post("/delete-reminder", requireAuth, deleteReminderController);
router.post("/register-device-token", requireAuth, registerDeviceTokenController);
router.post("/unregister-device-token", requireAuth, unregisterDeviceTokenController);
router.get("/getCalendarEvents", requireAuth, getCalendarEventsController);
router.post("/create-calendar-event", requireAuth, createCalendarEventController);
router.post("/update-calendar-event", requireAuth, updateCalendarEventController);
router.post("/delete-calendar-event", requireAuth, deleteCalendarEventController);
router.post("/startListning", startListningController);



router.get("/gettranscriptchunk", gettranscriptchunkcontroller)

export default router;
