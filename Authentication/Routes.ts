import { Router } from "express";
import {
  sendOTPController,
  verifyOTPController,
} from "./Controllers/Auth.controller";

const router = Router();

router.post("/send-otp", sendOTPController);
router.post("/verify-otp", verifyOTPController);

// router.post('/google', googleController)

export default router;
