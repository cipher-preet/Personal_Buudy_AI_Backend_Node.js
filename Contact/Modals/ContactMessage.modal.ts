import mongoose, { Document } from "mongoose";

export const CONTACT_REASONS = [
  "Product question",
  "Support",
  "Partnership",
  "Privacy request",
  "Feedback",
] as const;

export type ContactReason = (typeof CONTACT_REASONS)[number];

export const isContactReason = (value: string): value is ContactReason =>
  CONTACT_REASONS.includes(value as ContactReason);

export interface IContactMessage extends Document {
  name: string;
  email: string;
  reason: ContactReason;
  message: string;
  source: string;
  emailed: boolean;
}

const contactMessageSchema = new mongoose.Schema<IContactMessage>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    reason: { type: String, enum: CONTACT_REASONS, required: true },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    source: { type: String, required: true, default: "website", trim: true },
    emailed: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

if (mongoose.models.ContactMessage) {
  mongoose.deleteModel("ContactMessage");
}

const ContactMessage = mongoose.model<IContactMessage>(
  "ContactMessage",
  contactMessageSchema,
);

export default ContactMessage;
