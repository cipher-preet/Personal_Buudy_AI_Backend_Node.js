import nodemailer from "nodemailer";

import type { EmailAdapter, OutboundEmail, SentEmail } from "./types.js";

/**
 * Paid organization SMTP hosts from Zoho Mail's SMTP guide.
 * https://www.zoho.com/mail/help/zoho-smtp.html
 * Datacenter suffixes follow Zoho's own DC list (com, in, eu, au, jp, ca, sa, ae).
 * The exact host for a mailbox is also shown in Zoho Mail → Settings → Mail Accounts.
 */
const PAID_SMTP_HOSTS: Record<string, string> = {
  com: "smtppro.zoho.com",
  in: "smtppro.zoho.in",
  eu: "smtppro.zoho.eu",
  au: "smtppro.zoho.com.au",
  jp: "smtppro.zoho.jp",
  ca: "smtppro.zohocloud.ca",
  sa: "smtppro.zoho.sa",
  ae: "smtppro.zoho.ae",
};

export class MailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailConfigError";
  }
}

export class MailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailDeliveryError";
  }
}

export type ZohoMailConfig = {
  user: string;
  password: string;
  host: string;
  port: number;
  fromName: string;
};

export const resolveZohoSmtpHost = (datacenter: string, hostOverride?: string) => {
  const override = hostOverride?.trim();
  if (override) {
    return override;
  }

  const key = datacenter.trim().toLowerCase().replace(/^\./, "");
  const host = PAID_SMTP_HOSTS[key];
  if (!host) {
    throw new MailConfigError(
      `Unknown Zoho datacenter "${datacenter}". Set ZOHO_SMTP_HOST to the outgoing server shown in Zoho Mail settings.`,
    );
  }
  return host;
};

export const readZohoMailConfig = (
  env: NodeJS.ProcessEnv = process.env,
): ZohoMailConfig => {
  const user = env.ZOHO_MAIL_USER?.trim() || "";
  const password = env.ZOHO_MAIL_APP_PASSWORD?.trim() || env.ZOHO_MAIL_PASSWORD?.trim() || "";
  if (!user || !password) {
    throw new MailConfigError(
      "Zoho mail is not configured. Set ZOHO_MAIL_USER and ZOHO_MAIL_APP_PASSWORD.",
    );
  }

  const port = Number(env.ZOHO_SMTP_PORT || 465);
  if (port !== 465 && port !== 587) {
    throw new MailConfigError("ZOHO_SMTP_PORT must be 465 (SSL) or 587 (TLS).");
  }

  return {
    user,
    password,
    host: resolveZohoSmtpHost(env.ZOHO_DC || "com", env.ZOHO_SMTP_HOST),
    port,
    fromName: env.ZOHO_MAIL_FROM_NAME?.trim() || "KukuNotes",
  };
};

export const createZohoEmailAdapter = (config: ZohoMailConfig): EmailAdapter => {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port === 587,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  return {
    provider: "zoho",
    async send(message: OutboundEmail): Promise<SentEmail> {
      try {
        const sent = await transport.sendMail({
          from: {
            name: config.fromName,
            address: config.user,
          },
          to: message.to,
          replyTo: message.replyTo,
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: message.attachments,
        });
        return { messageId: sent.messageId };
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown SMTP error";
        console.error("Zoho SMTP send failed", detail);
        throw new MailDeliveryError(
          "Zoho could not send the email. Check the mailbox, app password, and SMTP host.",
        );
      }
    },
  };
};
