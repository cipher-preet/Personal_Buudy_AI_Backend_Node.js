import mongoose from "mongoose";

const supportTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    contactEmail: {
      type: String,
      trim: true,
      maxlength: 254,
      default: null,
    },
    contactName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    categoryId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    categoryLabel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "support_tickets",
  },
);

supportTicketSchema.index({ userId: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });

const SupportTicket =
  mongoose.models.SupportTicket ||
  mongoose.model("SupportTicket", supportTicketSchema);

export { SupportTicket };
