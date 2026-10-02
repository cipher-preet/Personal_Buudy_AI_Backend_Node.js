import { Router } from "express";
import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";
import {
  disconnectGoogleCalendarController,
  getGoogleCalendarConnectUrlController,
  getGoogleCalendarStatusController,
  googleCalendarCallbackController,
  syncGoogleCalendarController,
} from "./Controllers/GoogleCalendar.Controller.js";

const router = Router();

router.get("/google-calendar/status", requireAuth, getGoogleCalendarStatusController);
router.post("/google-calendar/connect", requireAuth, getGoogleCalendarConnectUrlController);
router.post("/google-calendar/sync", requireAuth, syncGoogleCalendarController);
router.post("/google-calendar/disconnect", requireAuth, disconnectGoogleCalendarController);
// Google redirects the browser here without our auth header; the signed `state` identifies the user.
router.get("/google-calendar/callback", googleCalendarCallbackController);

export default router;
