import { Router } from "express";
import {
  createSpaceController,
  deleteSpaceController,
  deleteStagedNoteController,
  deleteStagedTaskController,
  getNoteWorkspacesController,
  getProfileSummaryController,
  getSpaceStatsController,
  getStagedNoteByIdController,
  getStagedNotesBySpaceController,
  getStagedTasksBySpaceController,
  getUserActiveSpaceController,
  getUserSpacesByUserIdController,
  startListningController,
} from "./Controllers/Home.Controller.js";
import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";

const router = Router();

// router.use(requireAuth);

router.post("/create-space", createSpaceController);
router.post("/delete-space", requireAuth, deleteSpaceController);
router.get("/getuserspaces", getUserSpacesByUserIdController);
router.get("/getUserActiveSpace", getUserActiveSpaceController);
router.get("/getSpaceStats", getSpaceStatsController);
router.get("/getProfileSummary", getProfileSummaryController);
router.get("/getNoteWorkspaces", getNoteWorkspacesController);
router.get("/getStagedNotesBySpace", getStagedNotesBySpaceController);
router.get("/getStagedNoteById", getStagedNoteByIdController);
router.post("/delete-staged-note", requireAuth, deleteStagedNoteController);
router.get("/getStagedTasksBySpace", getStagedTasksBySpaceController);
router.post("/delete-staged-task", requireAuth, deleteStagedTaskController);
router.post("/startListning", startListningController);

export default router;
