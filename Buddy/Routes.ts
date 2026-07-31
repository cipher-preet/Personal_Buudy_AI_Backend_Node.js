import { Router } from "express";
import {
  createSpaceController,
  getNoteWorkspacesController,
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
router.get("/getuserspaces", getUserSpacesByUserIdController);
router.get("/getUserActiveSpace", getUserActiveSpaceController);
router.get("/getSpaceStats", getSpaceStatsController);
router.get("/getNoteWorkspaces", getNoteWorkspacesController);
router.get("/getStagedNotesBySpace", getStagedNotesBySpaceController);
router.get("/getStagedNoteById", getStagedNoteByIdController);
router.get("/getStagedTasksBySpace", getStagedTasksBySpaceController);
router.post("/startListning", startListningController);

export default router;
