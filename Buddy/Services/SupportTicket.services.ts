import {
  createSupportTicketRepository,
  type SupportTicketWriteInput,
} from "../Repository/SupportTicket.repository.js";

export const createSupportTicketServices = async (
  userId: string,
  payload: SupportTicketWriteInput,
) => {
  try {
    return await createSupportTicketRepository(userId, payload);
  } catch (error) {
    console.log("error in SupportTicket service Layer ", error);
    throw error;
  }
};
