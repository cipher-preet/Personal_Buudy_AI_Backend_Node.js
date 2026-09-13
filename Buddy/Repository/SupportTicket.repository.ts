import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import { SupportTicket } from "../Modals/SupportTicket.Modal.js";

export type SupportTicketWriteInput = {
  categoryId: string;
  categoryLabel: string;
  subject: string;
  message: string;
  contactEmail?: string | null;
  contactName?: string | null;
};

export const createSupportTicketRepository = async (
  userId: string,
  payload: SupportTicketWriteInput,
) => {
  try {
    if (!mongoose.isValidObjectId(userId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid user.",
      };
    }

    const created = await SupportTicket.create({
      userId: new mongoose.Types.ObjectId(userId),
      contactEmail: payload.contactEmail || null,
      contactName: payload.contactName || null,
      categoryId: payload.categoryId,
      categoryLabel: payload.categoryLabel,
      subject: payload.subject,
      message: payload.message,
      status: "open",
    });

    if (!created) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Failed to raise support ticket.",
      };
    }

    return {
      status: STATUS_CODE.CREATED,
      data: {
        message: "Support ticket raised successfully.",
        ticketId: String(created._id),
        status: created.status,
      },
    };
  } catch (error) {
    console.log("error in SupportTicket repository Layer ", error);
    throw error;
  }
};
