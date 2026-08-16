import { Router } from "express";
import {
  getAdminAiLayerController,
  getAdminOverviewController,
  getAdminPaymentsController,
  getAdminPlansController,
  getAdminUserDetailController,
  getAdminUsersController,
  requireAdminAccess,
  updateAdminPaymentController,
  updateAdminPlanController,
  updateAdminSubscriptionController,
} from "./Controllers/Admin.controller.js";

const router = Router();

router.use(requireAdminAccess);

router.get("/overview", getAdminOverviewController);
router.get("/users", getAdminUsersController);
router.get("/users/:userId", getAdminUserDetailController);
router.get("/payments", getAdminPaymentsController);
router.patch("/payments/:paymentId", updateAdminPaymentController);
router.get("/plans", getAdminPlansController);
router.patch("/plans/:planId", updateAdminPlanController);
router.patch("/subscriptions/:subscriptionId", updateAdminSubscriptionController);
router.get("/ai-layer", getAdminAiLayerController);

export default router;
