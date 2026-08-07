import { Router } from "express";
import multer from "multer";
import {
  completeOnboardingController,
  checkAuthController,
  getMeController,
  googleLoginController,
  loginController,
  logoutController,
  sendOTPController,
  updateMeController,
  updateAvatarController,
  verifyOTPController,
} from "./Controllers/Auth.controller.js";
import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";

const router = Router();
const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(new Error("Only JPG, PNG, or WEBP profile images are allowed"));
      return;
    }

    cb(null, true);
  },
});

router.post("/send-otp", sendOTPController);
router.post("/verify-otp", verifyOTPController);
router.post("/login", loginController);
router.post("/google", googleLoginController);
router.post("/onboarding", completeOnboardingController);
router.get("/checkauth", requireAuth, checkAuthController);
router.get("/me", requireAuth, getMeController);
router.patch("/me", requireAuth, updateMeController);
router.patch(
  "/me/avatar",
  requireAuth,
  profileImageUpload.single("avatar"),
  updateAvatarController,
);
router.post("/logout", logoutController);

export default router;
