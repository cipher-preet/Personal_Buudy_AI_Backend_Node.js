export type EmailAttachment = {
  filename: string;
  path: string;
  cid?: string;
  contentType?: string;
};

export type OutboundEmail = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

export type SentEmail = {
  messageId: string;
};

/** One implementation per provider. Call sites depend on this, not on Zoho. */
export interface EmailAdapter {
  readonly provider: string;
  send(message: OutboundEmail): Promise<SentEmail>;
}
