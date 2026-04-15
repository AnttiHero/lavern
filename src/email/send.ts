/**
 * Email — Transactional email via Resend.
 *
 * Gracefully degrades: if RESEND_API_KEY is not set, logs the email
 * to console instead of sending. This lets the system work in dev
 * without an email provider.
 */

import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { captureError } from '../utils/sentry.js';

const logger = createLogger('EMAIL');

/** Retry schedule for transient Resend failures (ms).
 *  Total worst-case wall time: ~6.5s before we give up.
 *  Password reset / verification emails are time-critical, so we can't wait longer. */
const RETRY_DELAYS_MS = [500, 1500, 4500] as const;

/** HTTP status codes that are worth retrying. Everything else (400, 401, 403,
 *  422 invalid-recipient etc.) is a permanent failure — retrying won't help. */
const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as Record<string, unknown>;
  const status = typeof anyErr.statusCode === 'number' ? anyErr.statusCode
    : typeof anyErr.status === 'number' ? anyErr.status
    : undefined;
  if (status !== undefined) return TRANSIENT_STATUS.has(status);
  // Network-level errors from undici/fetch bubble up as TypeError or have a `code`.
  const code = typeof anyErr.code === 'string' ? anyErr.code : '';
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(code)) {
    return true;
  }
  // Resend SDK sometimes surfaces { name: 'rate_limit_exceeded' }
  const name = typeof anyErr.name === 'string' ? anyErr.name : '';
  return name.includes('rate_limit') || name.includes('timeout');
}

// ── Types ────────────────────────────────────────────────────────────────

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// ── HTML Escaping ────────────────────────────────────────────────────────

/** Escape HTML special characters to prevent XSS in email templates. */
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Shared styling ───────────────────────────────────────────────────────

const BRAND = {
  bg: '#0A0A0F',
  surface: '#141419',
  gold: '#C9A227',
  text: '#FAF9F6',
  textDim: 'rgba(250, 249, 246, 0.55)',
  border: 'rgba(250, 249, 246, 0.08)',
};

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:48px 28px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:28px;font-weight:300;letter-spacing:8px;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">LAVERN</span>
    </div>
    ${content}
    <div style="text-align:center;margin-top:40px;padding-top:24px;border-top:1px solid ${BRAND.border};">
      <span style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${BRAND.textDim};">
        The World's First Driverless Law Firm
      </span>
    </div>
  </div>
</body>
</html>`;
}

// ── Send ──────────────────────────────────────────────────────────────────

async function send(payload: EmailPayload): Promise<boolean> {
  const apiKey = config.email.resendApiKey;

  if (!apiKey) {
    logger.info('email_dev_mode', { to: payload.to, subject: payload.subject });
    if (payload.text) logger.debug('email_text', payload.text);
    return true; // Graceful — don't break the flow
  }

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  let lastErr: unknown = null;
  const maxAttempts = RETRY_DELAYS_MS.length + 1; // 1 initial + N retries

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await resend.emails.send({
        from: config.email.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        ...(payload.text ? { text: payload.text } : {}),
      });

      // Resend SDK returns { data, error } — a non-throwing error must still
      // be treated as a failure so we don't silently drop verification emails.
      const apiErr = (result as { error?: unknown })?.error;
      if (apiErr) {
        lastErr = apiErr;
        if (attempt < maxAttempts && isTransientError(apiErr)) {
          logger.warn('email_transient_error', { attempt, maxAttempts, error: apiErr });
          await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
          continue;
        }
        break;
      }

      if (attempt > 1) {
        logger.info('email_sent_after_retry', { subject: payload.subject, to: payload.to, attempts: attempt });
      } else {
        logger.info('email_sent', { subject: payload.subject, to: payload.to });
      }
      return true;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransientError(err)) {
        logger.warn('email_transient_error', { attempt, maxAttempts, error: err });
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
        continue;
      }
      break;
    }
  }

  // All attempts exhausted (or permanent error) — route to Sentry so we notice
  // rising delivery failure rates. Password reset / verification failures are
  // particularly critical: users are locked out with no recourse.
  logger.error('email_send_failed', {
    to: payload.to,
    subject: payload.subject,
    error: lastErr,
  });
  captureError(
    lastErr instanceof Error ? lastErr : new Error(`Email send failed: ${String(lastErr)}`),
    { to: payload.to, subject: payload.subject },
  );
  return false;
}

// ── Templates ────────────────────────────────────────────────────────────

/** Sent when someone joins the waitlist. */
export async function sendWaitlistConfirmation(email: string): Promise<boolean> {
  return send({
    to: email,
    subject: "You're on the Lavern waitlist",
    text: "You're on the list. We'll send your invite code when it's your turn.",
    html: emailWrapper(`
      <div style="background:${BRAND.surface};border-radius:12px;padding:32px 28px;border:1px solid ${BRAND.border};">
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:300;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">
          You're on the list.
        </h2>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:${BRAND.textDim};">
          We're letting people in gradually. When it's your turn, we'll send you
          an invite code with <strong style="color:${BRAND.gold};">50 free billable hours</strong>
          to get started.
        </p>
        <p style="margin:0;font-size:13px;color:${BRAND.textDim};">
          No action needed — just keep an eye on this inbox.
        </p>
      </div>
    `),
  });
}

/** Sent when admin invites a user — delivers the invite code. */
export async function sendInviteEmail(email: string, inviteCode: string): Promise<boolean> {
  return send({
    to: email,
    subject: "Your Lavern invite is ready",
    text: `Your invite code: ${inviteCode} — Sign up at ${config.email.appUrl} with this code and your email. You'll get 50 free billable hours.`,
    html: emailWrapper(`
      <div style="background:${BRAND.surface};border-radius:12px;padding:32px 28px;border:1px solid ${BRAND.border};">
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:300;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">
          You're in.
        </h2>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:${BRAND.textDim};">
          Your invite to Lavern is ready. Use the code below to create your account.
        </p>
        <div style="text-align:center;margin:24px 0;padding:20px;background:rgba(201,162,39,0.06);border:1px solid rgba(201,162,39,0.2);border-radius:8px;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${BRAND.textDim};margin-bottom:8px;">Your Invite Code</div>
          <div style="font-size:24px;font-family:'Courier New',monospace;font-weight:600;color:${BRAND.gold};letter-spacing:2px;">
            ${esc(inviteCode)}
          </div>
        </div>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:${BRAND.textDim};">
          Sign up at <a href="${esc(config.email.appUrl)}" style="color:${BRAND.gold};text-decoration:none;">${esc(config.email.appUrl)}</a>
          using <strong style="color:${BRAND.text};">${esc(email)}</strong> and this code.
        </p>
        <p style="margin:0;font-size:14px;color:${BRAND.text};">
          You'll get <strong style="color:${BRAND.gold};">50 free billable hours</strong> — enough for
          several document reviews.
        </p>
      </div>
    `),
  });
}

/** Sent after a successful Stripe payment (pack purchase or subscription upgrade). */
export async function sendPaymentReceiptEmail(
  email: string,
  details: {
    type: 'pack' | 'subscription';
    packName?: string;
    hours?: number;
    plan?: string;
    amountLabel: string;
    newBalance?: number;
  },
): Promise<boolean> {
  const isPack = details.type === 'pack';
  const purchaseDesc = isPack
    ? `${esc(details.packName ?? 'Hour')} Pack — ${details.hours ?? 0} billable hours`
    : `${esc(details.plan ?? 'Plan')} Plan — Monthly subscription`;
  const balanceLine = details.newBalance !== undefined
    ? `<p style="margin:16px 0 0;font-size:14px;color:${BRAND.textDim};">Your new balance: <strong style="color:${BRAND.gold};">${details.newBalance.toFixed(1)} hours</strong></p>`
    : '';

  return send({
    to: email,
    subject: isPack ? `Receipt: ${details.hours}h added to your Lavern account` : `Receipt: ${esc(details.plan ?? '')} plan activated`,
    text: `Payment confirmed: ${purchaseDesc} for ${details.amountLabel}.${details.newBalance !== undefined ? ` New balance: ${details.newBalance.toFixed(1)}h.` : ''}`,
    html: emailWrapper(`
      <div style="background:${BRAND.surface};border-radius:12px;padding:32px 28px;border:1px solid ${BRAND.border};">
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:300;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">
          Payment confirmed.
        </h2>
        <div style="margin:20px 0;padding:16px 20px;background:rgba(201,162,39,0.06);border-radius:8px;border:1px solid rgba(201,162,39,0.12);">
          <div style="font-size:13px;color:${BRAND.textDim};line-height:1.6;">
            <strong style="color:${BRAND.text};">${purchaseDesc}</strong><br/>
            Amount: <strong style="color:${BRAND.gold};">${esc(details.amountLabel)}</strong>
          </div>
        </div>
        ${balanceLine}
        <div style="text-align:center;margin-top:28px;">
          <a href="${config.email.appUrl}/#/pricing" style="display:inline-block;padding:14px 32px;background:${BRAND.gold};color:${BRAND.bg};font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:6px;">
            View Your Balance
          </a>
        </div>
      </div>
    `),
  });
}

/** Sent when a user's billable hours drop below the warning threshold. */
export async function sendLowBalanceEmail(
  email: string,
  details: { balance: number; threshold: number },
): Promise<boolean> {
  return send({
    to: email,
    subject: `Low balance: ${details.balance.toFixed(1)} billable hours remaining`,
    text: `Your Lavern balance is ${details.balance.toFixed(1)} hours. Top up at ${config.email.appUrl}/#/pricing to avoid interruption.`,
    html: emailWrapper(`
      <div style="background:${BRAND.surface};border-radius:12px;padding:32px 28px;border:1px solid ${BRAND.border};">
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:300;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">
          Running low on hours.
        </h2>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:${BRAND.textDim};">
          You have <strong style="color:${BRAND.gold};">${details.balance.toFixed(1)} billable hours</strong> remaining.
          To avoid interruption during your next engagement, consider topping up.
        </p>
        <div style="text-align:center;margin-top:28px;">
          <a href="${config.email.appUrl}/#/pricing" style="display:inline-block;padding:14px 32px;background:${BRAND.gold};color:${BRAND.bg};font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:6px;">
            Buy More Hours
          </a>
        </div>
      </div>
    `),
  });
}

/** Sent when a user requests a password reset. */
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
  return send({
    to: email,
    subject: 'Reset your Lavern password',
    text: `Reset your password: ${resetUrl} — This link expires in 1 hour.`,
    html: emailWrapper(`
      <div style="background:${BRAND.surface};border-radius:12px;padding:32px 28px;border:1px solid ${BRAND.border};">
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:300;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">
          Reset your password.
        </h2>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:${BRAND.textDim};">
          We received a request to reset your password. Click the button below to choose a new one.
          This link expires in <strong style="color:${BRAND.text};">1 hour</strong>.
        </p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${esc(resetUrl)}" style="display:inline-block;padding:14px 32px;background:${BRAND.gold};color:${BRAND.bg};font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:6px;">
            Reset Password
          </a>
        </div>
        <p style="margin:0;font-size:12px;color:${BRAND.textDim};">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `),
  });
}

/** Sent on signup to verify the user's email address. */
export async function sendVerificationEmail(email: string, verifyUrl: string): Promise<boolean> {
  return send({
    to: email,
    subject: 'Verify your Lavern email',
    text: `Verify your email: ${verifyUrl} — This link expires in 24 hours.`,
    html: emailWrapper(`
      <div style="background:${BRAND.surface};border-radius:12px;padding:32px 28px;border:1px solid ${BRAND.border};">
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:300;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">
          Verify your email.
        </h2>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:${BRAND.textDim};">
          Click the button below to verify your email address. This link expires in
          <strong style="color:${BRAND.text};">24 hours</strong>.
        </p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${esc(verifyUrl)}" style="display:inline-block;padding:14px 32px;background:${BRAND.gold};color:${BRAND.bg};font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:6px;">
            Verify Email
          </a>
        </div>
        <p style="margin:0;font-size:12px;color:${BRAND.textDim};">
          If you didn't create a Lavern account, you can safely ignore this email.
        </p>
      </div>
    `),
  });
}

/** Sent to the referrer when someone signs up with their referral code. */
export async function sendReferralEmail(email: string, displayName: string | undefined, hoursEarned: number): Promise<boolean> {
  const greeting = esc(displayName || 'there');
  return send({
    to: email,
    subject: `You earned ${hoursEarned} hours — someone joined Lavern with your link`,
    text: `Someone signed up with your referral link. You earned ${hoursEarned} billable hours. Keep sharing: ${config.email.appUrl}`,
    html: emailWrapper(`
      <div style="background:${BRAND.surface};border-radius:12px;padding:32px 28px;border:1px solid ${BRAND.border};">
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:300;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">
          Nice one, ${greeting}.
        </h2>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:${BRAND.textDim};">
          Someone signed up with your referral link. We've credited
          <strong style="color:${BRAND.gold};">${hoursEarned} billable hours</strong> to your account.
        </p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:${BRAND.textDim};">
          Keep sharing — every signup earns you both ${hoursEarned} hours.
        </p>
        <div style="text-align:center;margin-top:28px;">
          <a href="${config.email.appUrl}/#/my-page" style="display:inline-block;padding:14px 32px;background:${BRAND.gold};color:${BRAND.bg};font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:6px;">
            View Your Balance
          </a>
        </div>
      </div>
    `),
  });
}

/** Sent after successful signup. */
export async function sendWelcomeEmail(email: string, displayName?: string): Promise<boolean> {
  const greeting = esc(displayName ? displayName : 'there');
  return send({
    to: email,
    subject: "Welcome to Lavern — 50 hours on us",
    text: `Welcome to Lavern! You have 50 billable hours to start. One hour = $0.10 of compute. Start at ${config.email.appUrl}`,
    html: emailWrapper(`
      <div style="background:${BRAND.surface};border-radius:12px;padding:32px 28px;border:1px solid ${BRAND.border};">
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:300;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">
          Welcome, ${greeting}.
        </h2>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:${BRAND.textDim};">
          Your account is live. We've credited you
          <strong style="color:${BRAND.gold};">50 billable hours</strong> to explore
          everything Lavern can do.
        </p>
        <div style="margin:20px 0;padding:16px 20px;background:rgba(201,162,39,0.06);border-radius:8px;border:1px solid rgba(201,162,39,0.12);">
          <div style="font-size:13px;color:${BRAND.textDim};line-height:1.6;">
            <strong style="color:${BRAND.text};">What can you do with 50 hours?</strong><br/>
            Quick legal question: ~5–10 hours<br/>
            Contract review (NDA, ToS): ~20–40 hours<br/>
            Full adversarial review: ~30–50 hours
          </div>
        </div>
        <div style="text-align:center;margin-top:28px;">
          <a href="${config.email.appUrl}" style="display:inline-block;padding:14px 32px;background:${BRAND.gold};color:${BRAND.bg};font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:6px;">
            Start Your First Engagement
          </a>
        </div>
      </div>
    `),
  });
}

// ── Claw Mode Email Templates ───────────────────────────────────────────

/** Sent when Claw finds critical issues in a document. */
export async function sendClawAlertEmail(
  email: string,
  title: string,
  message: string,
  dashboardUrl?: string,
): Promise<boolean> {
  return send({
    to: email,
    subject: `Lavern: ${title}`,
    text: `${title}\n\n${message}\n\n${dashboardUrl ? `Dashboard: ${dashboardUrl}` : ''}`,
    html: emailWrapper(`
      <div style="background:${BRAND.surface};border-radius:12px;padding:28px;border:1px solid ${BRAND.border};">
        <div style="font-size:18px;font-weight:600;color:${BRAND.gold};margin-bottom:12px;font-family:Georgia,'Times New Roman',serif;">
          ${esc(title)}
        </div>
        <div style="font-size:14px;color:${BRAND.text};line-height:1.6;margin-bottom:20px;">
          ${esc(message)}
        </div>
        ${dashboardUrl ? `
        <div style="text-align:center;margin-top:20px;">
          <a href="${dashboardUrl}" style="display:inline-block;padding:12px 28px;background:${BRAND.gold};color:${BRAND.bg};font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:6px;">
            View in Dashboard
          </a>
        </div>
        ` : ''}
      </div>
    `),
  });
}

/** Weekly digest of Claw activity. */
export async function sendClawDigestEmail(
  email: string,
  digest: {
    period: string;
    documentsProcessed: number;
    findingsSummary: { critical: number; major: number; minor: number };
    costUsd: number;
    precedentsLearned: number;
    budgetRemainingUsd: number;
  },
): Promise<boolean> {
  const { period, documentsProcessed, findingsSummary, costUsd, precedentsLearned, budgetRemainingUsd } = digest;
  const findings = `${findingsSummary.critical} critical, ${findingsSummary.major} major, ${findingsSummary.minor} minor`;

  return send({
    to: email,
    subject: `Lavern Weekly Digest — ${period}`,
    text: `Weekly Digest: ${period}\n\n${documentsProcessed} documents processed\nFindings: ${findings}\nCost: $${costUsd.toFixed(2)}\nPrecedents learned: ${precedentsLearned}\nBudget remaining: $${budgetRemainingUsd.toFixed(2)}`,
    html: emailWrapper(`
      <div style="background:${BRAND.surface};border-radius:12px;padding:28px;border:1px solid ${BRAND.border};">
        <div style="font-size:18px;font-weight:600;color:${BRAND.gold};margin-bottom:20px;font-family:Georgia,'Times New Roman',serif;">
          Weekly Digest
        </div>
        <div style="font-size:11px;color:${BRAND.textDim};letter-spacing:1px;text-transform:uppercase;margin-bottom:16px;">
          ${esc(period)}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:${BRAND.text};">
          <tr><td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};">Documents processed</td><td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};text-align:right;font-weight:600;">${documentsProcessed}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};">Findings</td><td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};text-align:right;">${findings}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};">Cost</td><td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};text-align:right;font-family:monospace;">$${costUsd.toFixed(2)}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};">Precedents learned</td><td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};text-align:right;">${precedentsLearned}</td></tr>
          <tr><td style="padding:8px 0;">Budget remaining</td><td style="padding:8px 0;text-align:right;font-family:monospace;font-weight:600;">$${budgetRemainingUsd.toFixed(2)}</td></tr>
        </table>
      </div>
    `),
  });
}
