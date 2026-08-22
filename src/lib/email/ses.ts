import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Report delivery over Amazon SES.
 *
 * SMTP rather than the SESv2 API, because that is what the supplied credentials
 * actually are. An `AKIA…` username paired with a 44-character secret is an SES
 * *SMTP* credential pair, not an IAM key — IAM secret access keys are 40
 * characters, and handing an SMTP password to the API signer produces exactly
 * the signature mismatch it did here. The two are generated from the same
 * console page and are easy to confuse.
 *
 * The recipient is always the signed-in analyst, read from their session — never
 * a hardcoded address and never taken from the request body. A console that
 * mails evidence to whoever asks is an exfiltration route.
 *
 * Credentials come from the environment. They are not in the repository and
 * must not be.
 */

export interface SesConfig {
  host: string;
  port: number;
  sender: string;
  user: string;
  pass: string;
}

export function sesConfig(): SesConfig | null {
  const region = process.env.SES_REGION?.trim();
  const sender = process.env.SES_SENDER?.trim();
  const user = process.env.SES_ACCESS_KEY_ID?.trim();
  const pass = process.env.SES_SECRET_ACCESS_KEY?.trim();
  if (!region || !sender || !user || !pass) return null;

  return {
    host: process.env.SES_SMTP_HOST?.trim() || `email-smtp.${region}.amazonaws.com`,
    /* 587 with STARTTLS. 465 works too but is the implicit-TLS port, and some
       hosts block it outright. */
    port: Number(process.env.SES_SMTP_PORT ?? 587),
    sender,
    user,
    pass,
  };
}

export const isEmailConfigured = () => sesConfig() !== null;

let transporter: Transporter | null = null;

function getTransport(config: SesConfig): Transporter {
  transporter ??= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    /* SES throttles per second; the pool keeps a burst of report sends from
       opening a connection each. */
    pool: true,
    maxConnections: 2,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
  });
  return transporter;
}

export interface SendResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
}

export async function sendReport(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  filename: string;
  pdf: Buffer;
}): Promise<SendResult> {
  const config = sesConfig();
  if (!config) {
    return { sent: false, reason: "Email is not configured on this deployment." };
  }

  try {
    const info = await getTransport(config).sendMail({
      from: `DefenSight <${config.sender}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: [
        { filename: opts.filename, content: opts.pdf, contentType: "application/pdf" },
      ],
    });
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    /* Never throw out of delivery. The PDF is already built and the caller can
       still hand it to the browser; losing the report because a mail gateway is
       unhappy would be the worse failure. */
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "Delivery failed.",
    };
  }
}

/** Proves the credentials and the host, without sending anything. */
export async function verifyEmail(): Promise<SendResult> {
  const config = sesConfig();
  if (!config) return { sent: false, reason: "Email is not configured." };
  try {
    await getTransport(config).verify();
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "Verification failed.",
    };
  }
}
