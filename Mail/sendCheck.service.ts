import { getEmailAdapter } from "./getEmailAdapter.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 10;

export class MailValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailValidationError";
  }
}

type CheckRecipient = {
  email: string;
  name: string;
  spaces: string[];
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const readRecipients = (body: unknown): CheckRecipient[] => {
  const record = body && typeof body === "object" ? (body as { recipients?: unknown }) : null;
  if (!Array.isArray(record?.recipients) || record.recipients.length === 0) {
    throw new MailValidationError("Add at least one email address.");
  }
  if (record.recipients.length > MAX_RECIPIENTS) {
    throw new MailValidationError(`Send at most ${MAX_RECIPIENTS} check emails at a time.`);
  }

  return record.recipients.map((item) => {
    const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const email = typeof entry.email === "string" ? entry.email.trim().toLowerCase() : "";
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : email;
    const spaces = Array.isArray(entry.spaces)
      ? entry.spaces.filter((space): space is string => typeof space === "string" && space.trim().length > 0)
      : [];

    if (!EMAIL_PATTERN.test(email)) {
      throw new MailValidationError(`"${email || "recipient"}" is not an email address.`);
    }

    return { email, name, spaces };
  });
};

/** Temporary delivery check. Not the full invite flow. */
export const sendMailCheck = async (body: unknown) => {
  const recipients = readRecipients(body);
  const mail = getEmailAdapter();
  const sent: Array<{ email: string; messageId: string }> = [];

  for (const recipient of recipients) {
    const spaceLine =
      recipient.spaces.length > 0 ? recipient.spaces.join(", ") : "No space selected";
    const result = await mail.send({
      to: [recipient.email],
      subject: "KukuNotes email check",
      text: [
        `Hi ${recipient.name},`,
        "",
        "This is a test email from KukuNotes to confirm Zoho Mail delivery.",
        `Spaces: ${spaceLine}`,
      ].join("\n"),
      html: `
        <p>Hi ${escapeHtml(recipient.name)},</p>
        <p>This is a test email from KukuNotes to confirm Zoho Mail delivery.</p>
        <p><strong>Spaces:</strong> ${escapeHtml(spaceLine)}</p>
      `,
    });
    sent.push({ email: recipient.email, messageId: result.messageId });
  }

  return { sentCount: sent.length, sent };
};
