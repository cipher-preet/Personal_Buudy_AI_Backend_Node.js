import { STATUS_CODE } from "../../Api/index.js";
import { transporter } from "../../Config/mail.js";
import ContactMessage, {
  isContactReason,
  type ContactReason,
} from "../Modals/ContactMessage.modal.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INBOX = process.env.CONTACT_INBOX || "team@kukunotes.com";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recentSubmissions = new Map<string, number[]>();

export type ContactInput = {
  name?: unknown;
  email?: unknown;
  reason?: unknown;
  message?: unknown;
};

const clean = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const isRateLimited = (key: string) => {
  const now = Date.now();
  const recent = (recentSubmissions.get(key) || []).filter((time) => now - time < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    recentSubmissions.set(key, recent);
    return true;
  }

  recent.push(now);
  recentSubmissions.set(key, recent);
  return false;
};

const notifyTeam = async (payload: {
  name: string;
  email: string;
  reason: ContactReason;
  message: string;
}) => {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    return false;
  }

  await transporter.sendMail({
    from: `"KukuNotes" <${process.env.MAIL_USER}>`,
    to: INBOX,
    replyTo: payload.email,
    subject: `KukuNotes contact: ${payload.reason}`,
    text: [
      `Name: ${payload.name}`,
      `Email: ${payload.email}`,
      `Reason: ${payload.reason}`,
      "",
      payload.message,
    ].join("\n"),
    html: `
      <p><strong>Name:</strong> ${escapeHtml(payload.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
      <p><strong>Reason:</strong> ${escapeHtml(payload.reason)}</p>
      <p style="white-space:pre-wrap;">${escapeHtml(payload.message)}</p>
    `,
  });

  return true;
};

export const submitContactService = async (
  input: ContactInput,
  clientKey: string,
): Promise<{
  status: number;
  message?: string;
  data?: { id: string; message: string };
}> => {
  const name = clean(input.name);
  const email = clean(input.email).toLowerCase();
  const reason = clean(input.reason);
  const message = clean(input.message);

  if (name.length < 2 || name.length > 120) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Please enter your name.",
    };
  }

  if (!EMAIL_PATTERN.test(email) || email.length > 200) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Please enter a valid email address.",
    };
  }

  if (!isContactReason(reason)) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Please choose a reason for contacting us.",
    };
  }

  if (message.length < 10 || message.length > 4000) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Please write a message of at least 10 characters.",
    };
  }

  if (isRateLimited(clientKey || email)) {
    return {
      status: 429,
      message: "Too many messages. Please try again in a little while.",
    };
  }

  const saved = await ContactMessage.create({
    name,
    email,
    reason,
    message,
    source: "website",
    emailed: false,
  });

  try {
    const emailed = await notifyTeam({ name, email, reason, message });
    if (emailed) {
      saved.emailed = true;
      await saved.save();
    }
  } catch (error) {
    console.error("Contact notification email failed", error);
  }

  return {
    status: STATUS_CODE.CREATED,
    data: {
      id: saved.id,
      message: "Thanks. We received your message and will reply by email.",
    },
  };
};
