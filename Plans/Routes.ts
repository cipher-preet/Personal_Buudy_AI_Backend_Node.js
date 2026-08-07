import { Router } from "express";
import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";
import {
  activateFreePlanController,
  getPlansController,
  getUserPlanStatusController,
  validatePlanLimitController,
} from "./Controllers/Plan.Controller.js";

const router = Router();

router.get("/", getPlansController);
router.get("/status", requireAuth, getUserPlanStatusController);
router.post("/free", requireAuth, activateFreePlanController);
router.post("/validate-limit", requireAuth, validatePlanLimitController);

export default router;
