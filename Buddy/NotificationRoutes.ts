import { Router } from "express";
import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";
import {
  getNotificationsController,
  getUnreadNotificationCountController,
  markAllNotificationsReadController,
  markNotificationsReadController,
} from "./Controllers/Notifications.Controller.js";

const router = Router();

router.get("/", requireAuth, getNotificationsController);
router.get("/unread-count", requireAuth, getUnreadNotificationCountController);
router.post("/read", requireAuth, markNotificationsReadController);
router.post("/read-all", requireAuth, markAllNotificationsReadController);

export default router;
