import { Router } from "express";
import {
  getAdminAiLayerController,
  getAdminFeedbackController,
  getAdminOverviewController,
  getAdminPaymentsController,
  getAdminPlansController,
  getAdminSupportTicketsController,
  getAdminUserDetailController,
  getAdminUsersController,
  requireAdminAccess,
  updateAdminFeedbackController,
  updateAdminPaymentController,
  updateAdminPlanController,
  updateAdminSubscriptionController,
  updateAdminSupportTicketController,
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
router.get("/support-tickets", getAdminSupportTicketsController);
router.patch("/support-tickets/:ticketId", updateAdminSupportTicketController);
router.get("/feedback", getAdminFeedbackController);
router.patch("/feedback/:feedbackId", updateAdminFeedbackController);

export default router;
