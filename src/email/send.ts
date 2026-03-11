/**
 * Email — Transactional email via Resend.
 *
 * Gracefully degrades: if RESEND_API_KEY is not set, logs the email
 * to console instead of sending. This lets the system work in dev
 * without an email provider.
 */

import { config } from '../config.js';

// ── Types ────────────────────────────────────────────────────────────────

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
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
      <span style="font-size:28px;font-weight:300;letter-spacing:8px;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">MARBLE</span>
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
    console.log(`[EMAIL] (no RESEND_API_KEY — logging instead)`);
    console.log(`[EMAIL]   To: ${payload.to}`);
    console.log(`[EMAIL]   Subject: ${payload.subject}`);
    if (payload.text) console.log(`[EMAIL]   ${payload.text}`);
    return true; // Graceful — don't break the flow
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: config.email.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      ...(payload.text ? { text: payload.text } : {}),
    });

    console.log(`[EMAIL] Sent "${payload.subject}" to ${payload.to}`);
    return true;
  } catch (err) {
    console.error('[EMAIL] Failed to send:', err);
    return false;
  }
}

// ── Templates ────────────────────────────────────────────────────────────

/** Sent when someone joins the waitlist. */
export async function sendWaitlistConfirmation(email: string): Promise<boolean> {
  return send({
    to: email,
    subject: "You're on the Marble waitlist",
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
    subject: "Your Marble invite is ready",
    text: `Your invite code: ${inviteCode} — Sign up at ${config.email.appUrl} with this code and your email. You'll get 50 free billable hours.`,
    html: emailWrapper(`
      <div style="background:${BRAND.surface};border-radius:12px;padding:32px 28px;border:1px solid ${BRAND.border};">
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:300;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">
          You're in.
        </h2>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:${BRAND.textDim};">
          Your invite to Marble is ready. Use the code below to create your account.
        </p>
        <div style="text-align:center;margin:24px 0;padding:20px;background:rgba(201,162,39,0.06);border:1px solid rgba(201,162,39,0.2);border-radius:8px;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${BRAND.textDim};margin-bottom:8px;">Your Invite Code</div>
          <div style="font-size:24px;font-family:'Courier New',monospace;font-weight:600;color:${BRAND.gold};letter-spacing:2px;">
            ${inviteCode}
          </div>
        </div>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:${BRAND.textDim};">
          Sign up at <a href="${config.email.appUrl}" style="color:${BRAND.gold};text-decoration:none;">${config.email.appUrl}</a>
          using <strong style="color:${BRAND.text};">${email}</strong> and this code.
        </p>
        <p style="margin:0;font-size:14px;color:${BRAND.text};">
          You'll get <strong style="color:${BRAND.gold};">50 free billable hours</strong> — enough for
          several document reviews.
        </p>
      </div>
    `),
  });
}

/** Sent after successful signup. */
export async function sendWelcomeEmail(email: string, displayName?: string): Promise<boolean> {
  const greeting = displayName ? displayName : 'there';
  return send({
    to: email,
    subject: "Welcome to Marble — 50 hours on us",
    text: `Welcome to Marble! You have 50 billable hours to start. One hour = $0.10 of compute. Start at ${config.email.appUrl}`,
    html: emailWrapper(`
      <div style="background:${BRAND.surface};border-radius:12px;padding:32px 28px;border:1px solid ${BRAND.border};">
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:300;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">
          Welcome, ${greeting}.
        </h2>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:${BRAND.textDim};">
          Your account is live. We've credited you
          <strong style="color:${BRAND.gold};">50 billable hours</strong> to explore
          everything Marble can do.
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
