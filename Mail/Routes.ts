import { Router } from "express";

import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";
import { sendMailCheckController } from "./Controllers/sendCheck.controller.js";

const router = Router();

router.post("/send-check", requireAuth, sendMailCheckController);

export default router;
