import { Router } from "express";
import {
  loginController,
  sendOTPController,
  verifyOTPController,
} from "./Controllers/Auth.controller";

const router = Router();

router.post("/send-otp", sendOTPController);
router.post("/verify-otp", verifyOTPController);
router.post("/login", loginController);

export default router;
