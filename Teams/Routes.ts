import { Router } from "express";

import { requireAuth } from "../MIddleware/Auth/Auth.middleware.js";
import {
  acceptInvitationController,
  listInvitationsController,
  listPeopleController,
  listSentInvitationsController,
  previewInvitationController,
  rejectInvitationController,
  removeInvitationSpaceController,
  revokeInvitationController,
  sendInvitationController,
} from "./invitation.controller.js";

const router = Router();

router.get("/people", requireAuth, listPeopleController);
router.get("/invitations", requireAuth, listInvitationsController);
router.get("/invitations/sent", requireAuth, listSentInvitationsController);
router.post("/invitations", requireAuth, sendInvitationController);
router.post("/invitations/:invitationId/revoke", requireAuth, revokeInvitationController);
router.post("/invitations/:invitationId/spaces/remove", requireAuth, removeInvitationSpaceController);
router.get("/invitations/:token", previewInvitationController);
router.post("/invitations/:token/accept", requireAuth, acceptInvitationController);
router.post("/invitations/:token/reject", requireAuth, rejectInvitationController);

export default router;
