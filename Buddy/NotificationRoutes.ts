import { Router } from "express";
import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";
import {
  getNotificationsController,
  markAllNotificationsReadController,
  markNotificationsReadController,
} from "./Controllers/Notifications.Controller.js";

const router = Router();

router.get("/", requireAuth, getNotificationsController);
router.post("/read", requireAuth, markNotificationsReadController);
router.post("/read-all", requireAuth, markAllNotificationsReadController);

export default router;
