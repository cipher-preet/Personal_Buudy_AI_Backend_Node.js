import { Router } from "express";
import {
  createSpaceController,
  getNoteWorkspacesController,
  getSpaceStatsController,
  getStagedNotesBySpaceController,
  getUserActiveSpaceController,
  getUserSpacesByUserIdController,
  startListningController,
} from "./Controllers/Home.Controller";
import { requireAuth } from "../MIddleware/Auth/Auth.middleware";

const router = Router();

// router.use(requireAuth);

router.post("/create-space", createSpaceController);
router.get("/getuserspaces", getUserSpacesByUserIdController);
router.get("/getUserActiveSpace", getUserActiveSpaceController);
router.get("/getSpaceStats", getSpaceStatsController);
router.get("/getNoteWorkspaces", getNoteWorkspacesController);
router.get("/getStagedNotesBySpace", getStagedNotesBySpaceController);
router.post("/startListning", startListningController);

export default router;
