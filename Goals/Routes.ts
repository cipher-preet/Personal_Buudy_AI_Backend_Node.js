import { Router } from "express";

import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";
import {
  activateGoalController,
  answerGoalController,
  approveGoalRevisionController,
  checkinGoalController,
  createGoalController,
  deleteGoalController,
  feedbackGoalController,
  getGoalController,
  getGoalDashboardController,
  getGoalSetupController,
  listGoalsController,
  pauseGoalController,
  retryGoalJobController,
  setGoalSpacesController,
  toggleGoalPlanItemController,
  getGoalSourcesController,
  refreshGoalResearchController,
  replanGoalController,
  goalWorkspaceActionController,
} from "./Controllers/Goal.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/", listGoalsController);
router.post("/", createGoalController);
router.get("/:id/setup", getGoalSetupController);
router.get("/:id/dashboard", getGoalDashboardController);
router.post("/:id/answers", answerGoalController);
router.put("/:id/spaces", setGoalSpacesController);
router.post("/:id/activate", activateGoalController);
router.post("/:id/checkins", checkinGoalController);
router.post("/:id/recommendations/:recommendationId/feedback", feedbackGoalController);
router.post("/:id/pause", pauseGoalController);
router.post("/:id/plan/approve", approveGoalRevisionController);
router.post("/:id/plan/items/toggle", toggleGoalPlanItemController);
router.post("/:id/workspace/actions", goalWorkspaceActionController);
router.get("/:id/sources", getGoalSourcesController);
router.post("/:id/research", refreshGoalResearchController);
router.post("/:id/replan", replanGoalController);
router.post("/:id/jobs/:jobId/retry", retryGoalJobController);
router.delete("/:id", deleteGoalController);
router.get("/:id", getGoalController);

export default router;
