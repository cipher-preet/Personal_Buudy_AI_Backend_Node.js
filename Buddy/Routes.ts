import { Router } from "express";
import {
  createSpaceController,
  getUserActiveSpaceController,
  getUserSpacesByUserIdController,
  startListningController,
} from "./Controllers/Home.Controller";

const router = Router();

router.post("/create-space", createSpaceController);
router.get("/getuserspaces", getUserSpacesByUserIdController);
router.get("/getUserActiveSpace", getUserActiveSpaceController);
router.post("/startListning", startListningController);

export default router;
