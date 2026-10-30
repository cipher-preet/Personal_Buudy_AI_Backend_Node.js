import { NextFunction, Response } from "express";

import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../Api/index.js";
import type { CustomRequest } from "../types/types.js";
import {
  acceptInvitation,
  InvitationError,
  listIncomingInvitations,
  listSentInvitations,
  listTeamPeople,
  previewInvitation,
  rejectInvitation,
  removeInvitationSpace,
  revokeInvitation,
  sendInvitation,
} from "./invitation.service.js";

const actorId = (req: CustomRequest) => req.authUser?.id || "";

const handle = async (res: Response, next: NextFunction, work: () => Promise<unknown>) => {
  try {
    const data = await work();
    return SuccessResponse(res, STATUS_CODE.OK, data as object);
  } catch (error) {
    if (error instanceof InvitationError) {
      return ErrorResponse(res, error.status, error.message);
    }
    next(error);
  }
};

export const sendInvitationController = (req: CustomRequest, res: Response, next: NextFunction) =>
  handle(res, next, () => sendInvitation(actorId(req), req.body || {}));

export const listInvitationsController = (req: CustomRequest, res: Response, next: NextFunction) =>
  handle(res, next, async () => ({ invitations: await listIncomingInvitations(actorId(req)) }));

export const listSentInvitationsController = (req: CustomRequest, res: Response, next: NextFunction) =>
  handle(res, next, async () => ({ invitations: await listSentInvitations(actorId(req)) }));

export const previewInvitationController = (req: CustomRequest, res: Response, next: NextFunction) =>
  handle(res, next, () => previewInvitation(String(req.params.token || "")));

export const acceptInvitationController = (req: CustomRequest, res: Response, next: NextFunction) =>
  handle(res, next, () => acceptInvitation(String(req.params.token || ""), actorId(req)));

export const rejectInvitationController = (req: CustomRequest, res: Response, next: NextFunction) =>
  handle(res, next, () => rejectInvitation(String(req.params.token || ""), actorId(req)));

export const revokeInvitationController = (req: CustomRequest, res: Response, next: NextFunction) =>
  handle(res, next, () => revokeInvitation(actorId(req), String(req.params.invitationId || "")));

export const removeInvitationSpaceController = (req: CustomRequest, res: Response, next: NextFunction) =>
  handle(res, next, () =>
    removeInvitationSpace(actorId(req), String(req.params.invitationId || ""), req.body?.spaceId),
  );

export const listPeopleController = (req: CustomRequest, res: Response, next: NextFunction) =>
  handle(res, next, async () => ({ people: await listTeamPeople(actorId(req)) }));
