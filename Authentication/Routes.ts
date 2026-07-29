import { Router } from "express";
import {
  completeOnboardingController,
  checkAuthController,
  getMeController,
  googleLoginController,
  loginController,
  logoutController,
  sendOTPController,
  verifyOTPController,
} from "./Controllers/Auth.controller";
import { requireAuth } from "../MIddleware/Auth/Auth.middleware";

const router = Router();

router.post("/send-otp", sendOTPController);
router.post("/verify-otp", verifyOTPController);
router.post("/login", loginController);
router.post("/google", googleLoginController);
router.post("/onboarding", completeOnboardingController);
router.get("/checkauth", requireAuth, checkAuthController);
router.get("/me", requireAuth, getMeController);
router.post("/logout", logoutController);

export default router;
