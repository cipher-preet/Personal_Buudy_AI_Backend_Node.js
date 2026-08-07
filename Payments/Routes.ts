import { Router } from "express";
import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";
import {
  createPaymentLinkController,
  createPaymentOrderController,
  verifyPaymentController,
} from "./Controllers/Payment.Controller.js";

const router = Router();

router.post("/order", requireAuth, createPaymentOrderController);
router.post("/payment-link", requireAuth, createPaymentLinkController);
router.post("/verify", requireAuth, verifyPaymentController);

export default router;
