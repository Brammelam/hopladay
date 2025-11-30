import nodemailer from 'nodemailer';
import crypto from 'crypto';
import dotenv from "dotenv";
dotenv.config();

/**
 * Email Service
 * Centralized email sending service using Nodemailer
 * Uses lazy initialization to ensure environment variables are loaded
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  /**
   * Lazy initialization - ensures env vars are loaded before initializing
   */
  ensureInitialized() {
    if (this.initialized) {
      return;
    }

    // Initialize Nodemailer if credentials are available
    if (process.env.EMAILUSER && process.env.EMAILPWD) {
      console.log("✓ Nodemailer configured");
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: 587,
        auth: {
          user: process.env.EMAILUSER,
          pass: process.env.EMAILPWD
        },
        tls: {
          ciphers: 'SSLv3'
        }
      });
    } else {
      console.log("⚠️  EMAILUSER/EMAILPWD not set");
    }

    this.initialized = true;
  }

  /**
   * Generate plain text version from HTML
   */
  htmlToText(html) {
    // Simple HTML to text conversion - remove tags and decode entities
    return html
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generate unsubscribe token for a user
   */
  generateUnsubscribeToken(email) {
    const secret = process.env.UNSUBSCRIBE_SECRET || process.env.MONGO_URI || 'default-secret-change-in-production';
    return crypto
      .createHmac('sha256', secret)
      .update(email)
      .digest('base64url');
  }

  /**
   * Extract full domain from email address (preserves subdomain)
   * e.g., "mail.hopladay.com" from "noreply@mail.hopladay.com"
   */
  extractDomainFromEmail(email) {
    if (!email) return null;
    const match = email.match(/@([^>]+)/);
    if (match) {
      let domain = match[1].trim();
      // Remove quotes if present
      domain = domain.replace(/['"]/g, '');
      return domain;
    }
    return null;
  }

  /**
   * Extract root domain from full domain (removes subdomain)
   * e.g., "hopladay.com" from "mail.hopladay.com"
   */
  extractRootDomain(domain) {
    if (!domain) return null;
    const parts = domain.split('.');
    if (parts.length >= 2) {
      // Take last two parts for root domain
      return parts.slice(-2).join('.');
    }
    return domain;
  }

  /**
   * Check if a URL belongs to the same domain family
   */
  isSameDomainFamily(url, rootDomain) {
    if (!url || !rootDomain) return false;
    try {
      const urlObj = new URL(url);
      const urlHost = urlObj.hostname.toLowerCase();
      const rootDomainLower = rootDomain.toLowerCase();
      // Check if URL host is the root domain or a subdomain of it
      return urlHost === rootDomainLower || urlHost.endsWith('.' + rootDomainLower);
    } catch (e) {
      return false;
    }
  }

  /**
   * Get base URL that matches the sending domain
   * Uses subdomain when available to segment sending by purpose
   * This ensures URLs in emails match the sending domain to avoid spam filters
   */
  getBaseUrlFromSendingDomain() {
    // Extract full domain (including subdomain) from sending email
    let sendingDomain = null;
    let sendingRootDomain = null;
    
    // Extract from EMAILUSER
    if (process.env.EMAILUSER) {
      sendingDomain = this.extractDomainFromEmail(process.env.EMAILUSER);
      if (sendingDomain) {
        sendingRootDomain = this.extractRootDomain(sendingDomain);
      }
    }

    // If we have a sending domain, check if FRONTEND_URL matches it
    if (sendingRootDomain) {
      const frontendUrl = process.env.FRONTEND_URL || process.env.ORIGIN;
      if (frontendUrl && this.isSameDomainFamily(frontendUrl, sendingRootDomain)) {
        // FRONTEND_URL is on the same domain family, use it
        return frontendUrl;
      }
      
      // If sending from a subdomain, prefer using a subdomain for URLs
      // This segments sending by purpose and protects reputation
      if (sendingDomain !== sendingRootDomain) {
        // We're sending from a subdomain (e.g., mail.hopladay.com)
        // Use a subdomain for frontend URLs to match domain family
        const protocol = sendingRootDomain.includes('localhost') ? 'http' : 'https';
        const port = sendingRootDomain.includes('localhost') ? ':4200' : '';
        
        // Prefer FRONTEND_URL if it's set and matches the domain family
        // Otherwise, use 'app' subdomain as default for frontend (e.g., app.hopladay.com)
        // This keeps URLs on the same domain family while using subdomains
        if (frontendUrl && this.isSameDomainFamily(frontendUrl, sendingRootDomain)) {
          return frontendUrl;
        }
        return `${protocol}://app.${sendingRootDomain}${port}`;
      }
      
      // Otherwise, construct URL from root domain
      const protocol = sendingRootDomain.includes('localhost') ? 'http' : 'https';
      const port = sendingRootDomain.includes('localhost') ? ':4200' : '';
      return `${protocol}://${sendingRootDomain}${port}`;
    }

    // Final fallback to FRONTEND_URL or ORIGIN
    return process.env.FRONTEND_URL || process.env.ORIGIN || 'https://hopladay.com';
  }

  /**
   * Generate unsubscribe URL for a user
   */
  getUnsubscribeUrl(email, token) {
    const baseUrl = this.getBaseUrlFromSendingDomain();
    return `${baseUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  }

  /**
   * Send email using Nodemailer
   */
  async sendEmail({ to, subject, html, replyTo, unsubscribeToken, skipUnsubscribeCheck = false }) {
    // Ensure initialization before sending
    this.ensureInitialized();

    // Check if user has unsubscribed (skip check for transactional emails like magic links)
    if (!skipUnsubscribeCheck) {
      const User = (await import('../models/User.js')).default;
      const user = await User.findOne({ email: to });
      if (user && user.emailUnsubscribed) {
        console.log(`Skipping email to ${to} - user has unsubscribed`);
        return { success: false, error: 'User has unsubscribed', skipped: true };
      }
    }

    // Get from address - use EMAILUSER with optional sender name
    let from;
    if (process.env.EMAILUSER) {
      const senderName = process.env.EMAIL_SENDER_NAME || 'Hopladay';
      from = `"${senderName}" <${process.env.EMAILUSER}>`;
    } else {
      throw new Error('EMAILUSER must be set in environment variables');
    }
    
    // Generate plain text version for better deliverability
    const text = this.htmlToText(html);

    // Generate unsubscribe URL if token provided
    let unsubscribeUrl = null;
    if (unsubscribeToken) {
      unsubscribeUrl = this.getUnsubscribeUrl(to, unsubscribeToken);
    }

    // Generate Message-ID for better deliverability
    const messageId = `<${Date.now()}-${Math.random().toString(36).substring(7)}@${this.extractDomainFromEmail(from) || 'hopladay.com'}>`;

    // Send via Nodemailer
    if (this.transporter) {
      try {
        const headers = {
          'X-Mailer': 'Hopladay',
        };

        // Add List-Unsubscribe headers if unsubscribe URL is available
        if (unsubscribeUrl) {
          headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
          headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
        }

        const info = await this.transporter.sendMail({
          from,
          to,
          subject,
          html,
          text, // Plain text version improves deliverability
          replyTo: replyTo || process.env.EMAILUSER || 'hello@hopladay.com',
          headers,
        });

        console.log(`Email sent via Nodemailer to ${to}`, { messageId: info.messageId });
        return { success: true, provider: 'nodemailer', messageId: info.messageId };
      } catch (err) {
        console.error('Nodemailer failed:', err.message);
        throw err;
      }
    }

    // No email provider configured
    console.warn('No email provider configured (add EMAILUSER/EMAILPWD)');
    return { success: false, error: 'No email provider configured' };
  }

  /**
   * Send email in background (non-blocking)
   */
  sendEmailAsync({ to, subject, html, replyTo, unsubscribeToken, skipUnsubscribeCheck }) {
    setImmediate(async () => {
      try {
        await this.sendEmail({ to, subject, html, replyTo, unsubscribeToken, skipUnsubscribeCheck });
      } catch (err) {
        console.error('Background email send failed:', err);
      }
    });
  }

  /**
   * Magic Link Email Template
   */
  getMagicLinkEmail(magicUrl, unsubscribeUrl = null) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 40px 20px; text-align: center;">
              <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 600;">Sign in to Hopladay</h2>
                    <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.5;">Click the button below to access your vacation plans:</p>
                    <table role="presentation" style="width: 100%; margin: 30px 0;">
                      <tr>
                        <td style="text-align: center;">
                          <a href="${magicUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">Sign In to Hopladay</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                      This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.
                    </p>
                    <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 12px; word-break: break-all;">
                      Or copy this link: <span style="color: #6b7280;">${magicUrl}</span>
                    </p>
                  </td>
                </tr>
              </table>
                    <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 12px;">
                This email was sent by Hopladay. If you have questions, contact us at 
                <a href="mailto:hello@hopladay.com" style="color: #2563eb; text-decoration: none;">hello@hopladay.com</a>
              </p>
              ${unsubscribeUrl ? `
              <p style="margin: 15px 0 0 0; text-align: center;">
                <a href="${unsubscribeUrl}" style="color: #9ca3af; font-size: 11px; text-decoration: underline;">Unsubscribe from emails</a>
              </p>
              ` : ''}
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  /**
   * Premium Upgrade Email Template
   */
  getPremiumUpgradeEmail(unsubscribeUrl = null) {
    const baseUrl = this.getBaseUrlFromSendingDomain();
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 40px 20px; text-align: center;">
              <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 600;">Your Hopladay Premium Access Is Active</h2>
                    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                      Thank you for upgrading to <strong>Hopladay Premium</strong>.
                      Your payment was processed successfully, and Premium features are now fully unlocked on your account.
                    </p>
                    <table role="presentation" style="width: 100%; margin: 30px 0;">
                      <tr>
                        <td style="text-align: center;">
                          <a href="${baseUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">Go to Hopladay</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 30px 0 10px 0; color: #374151; font-size: 14px; font-weight: 600;">You will now have access to:</p>
                    <ul style="margin: 0 0 30px 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.8;">
                      <li>Unlimited vacation suggestions</li>
                      <li>All advanced strategies</li>
                      <li>Full use of all available vacation days</li>
                      <li>Calendar (.ics) and PDF export</li>
                      <li>Detailed ROI and efficiency insights</li>
                    </ul>
                    <h3 style="margin: 30px 0 10px 0; color: #111827; font-size: 18px; font-weight: 600;">Refund Guarantee</h3>
                    <p style="margin: 0 0 20px 0; color: #374151; font-size: 14px; line-height: 1.5;">
                      If you're not satisfied for any reason, you can request a 
                      <strong>full refund within 365 days</strong> of your purchase—no questions asked.
                    </p>
                    <p style="margin: 0 0 30px 0; color: #374151; font-size: 14px; line-height: 1.5;">
                      A receipt for this payment has also been sent to your email.
                    </p>
                    <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                      If you have any questions or need help, just reply to this email or contact us at 
                      <a href="mailto:hello@hopladay.com" style="color: #2563eb; text-decoration: none;">hello@hopladay.com</a>.
                    </p>
                    <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 12px;">
                      Thank you for supporting Hopladay!
                    </p>
                    ${unsubscribeUrl ? `
                    <p style="margin: 15px 0 0 0; text-align: center;">
                      <a href="${unsubscribeUrl}" style="color: #9ca3af; font-size: 11px; text-decoration: underline;">Unsubscribe from emails</a>
                    </p>
                    ` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  /**
   * Passkey Registration Email Template
   */
  getPasskeyEmail(unsubscribeUrl = null) {
    const baseUrl = this.getBaseUrlFromSendingDomain();
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 40px 20px; text-align: center;">
              <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 600;">Passkey Registered Successfully</h2>
                    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                      Your passkey has been successfully registered for your Hopladay account.
                      You can now sign in quickly and securely using your device's biometric authentication.
                    </p>
                    <table role="presentation" style="width: 100%; margin: 30px 0;">
                      <tr>
                        <td style="text-align: center;">
                          <a href="${baseUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">Go to Hopladay</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 30px 0 10px 0; color: #374151; font-size: 14px; font-weight: 600;">What is a passkey?</p>
                    <p style="margin: 0 0 20px 0; color: #374151; font-size: 14px; line-height: 1.5;">
                      A passkey is a more secure and convenient way to sign in. Instead of using a password, 
                      you can use your device's built-in security features like fingerprint, face recognition, 
                      or a PIN to authenticate.
                    </p>
                    <p style="margin: 20px 0 10px 0; color: #374151; font-size: 14px; font-weight: 600;">Benefits:</p>
                    <ul style="margin: 0 0 30px 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.8;">
                      <li>Faster sign-in with biometric authentication</li>
                      <li>More secure than passwords</li>
                      <li>Works across your devices</li>
                      <li>No passwords to remember</li>
                    </ul>
                    <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                      If you didn't register a passkey, please contact us immediately at 
                      <a href="mailto:hello@hopladay.com" style="color: #2563eb; text-decoration: none;">hello@hopladay.com</a>.
                    </p>
                    <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 12px;">
                      Thank you for using Hopladay!
                    </p>
                    ${unsubscribeUrl ? `
                    <p style="margin: 15px 0 0 0; text-align: center;">
                      <a href="${unsubscribeUrl}" style="color: #9ca3af; font-size: 11px; text-decoration: underline;">Unsubscribe from emails</a>
                    </p>
                    ` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  /**
   * Welcome Email Template
   */
  getWelcomeEmail(userName, unsubscribeUrl = null) {
    const baseUrl = this.getBaseUrlFromSendingDomain();
    const name = userName || 'there';
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 40px 20px; text-align: center;">
              <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 600;">Welcome to Hopladay!</h2>
                    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                      Hi ${name},
                    </p>
                    <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                      Welcome to <strong>Hopladay</strong>! We're excited to help you plan your time off like a pro.
                    </p>
                    <table role="presentation" style="width: 100%; margin: 30px 0;">
                      <tr>
                        <td style="text-align: center;">
                          <a href="${baseUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">Get Started</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 30px 0 10px 0; color: #374151; font-size: 14px; font-weight: 600;">What you can do with Hopladay:</p>
                    <ul style="margin: 0 0 30px 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.8;">
                      <li>Plan your vacation days strategically</li>
                      <li>Get AI-powered suggestions for optimal time off</li>
                      <li>Maximize your vacation time with smart planning</li>
                      <li>Export your plans to calendar apps</li>
                    </ul>
                    <p style="margin: 20px 0 10px 0; color: #374151; font-size: 14px; font-weight: 600;">Getting started is easy:</p>
                    <ol style="margin: 0 0 30px 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.8;">
                      <li>Select your country and year</li>
                      <li>Enter your available vacation days</li>
                      <li>Let our algorithms create the perfect plan for you</li>
                    </ol>
                    <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                      If you have any questions, feel free to reach out to us at 
                      <a href="mailto:hello@hopladay.com" style="color: #2563eb; text-decoration: none;">hello@hopladay.com</a>.
                    </p>
                    <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 12px;">
                      Happy planning!<br>
                      The Hopladay Team
                    </p>
                    ${unsubscribeUrl ? `
                    <p style="margin: 15px 0 0 0; text-align: center;">
                      <a href="${unsubscribeUrl}" style="color: #9ca3af; font-size: 11px; text-decoration: underline;">Unsubscribe from emails</a>
                    </p>
                    ` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  /**
   * Send Magic Link Email
   * Note: Magic links are transactional, so we skip unsubscribe check
   */
  async sendMagicLink(email, magicUrl) {
    const unsubscribeToken = this.generateUnsubscribeToken(email);
    const unsubscribeUrl = this.getUnsubscribeUrl(email, unsubscribeToken);
    const html = this.getMagicLinkEmail(magicUrl, unsubscribeUrl);
    return this.sendEmailAsync({
      to: email,
      subject: 'Sign in to Hopladay',
      html,
      unsubscribeToken,
      skipUnsubscribeCheck: true, // Magic links are transactional
    });
  }

  /**
   * Send Premium Upgrade Email
   */
  async sendPremiumUpgrade(email) {
    const unsubscribeToken = this.generateUnsubscribeToken(email);
    const unsubscribeUrl = this.getUnsubscribeUrl(email, unsubscribeToken);
    const html = this.getPremiumUpgradeEmail(unsubscribeUrl);
    return this.sendEmail({
      to: email,
      subject: 'Thank you for upgrading to Hopladay Premium',
      html,
      unsubscribeToken,
    });
  }

  /**
   * Send Passkey Registration Email
   */
  async sendPasskeyRegistered(email) {
    const unsubscribeToken = this.generateUnsubscribeToken(email);
    const unsubscribeUrl = this.getUnsubscribeUrl(email, unsubscribeToken);
    const html = this.getPasskeyEmail(unsubscribeUrl);
    return this.sendEmailAsync({
      to: email,
      subject: 'Passkey registered successfully',
      html,
      unsubscribeToken,
    });
  }

  /**
   * Send Welcome Email
   */
  async sendWelcome(email, userName) {
    const unsubscribeToken = this.generateUnsubscribeToken(email);
    const unsubscribeUrl = this.getUnsubscribeUrl(email, unsubscribeToken);
    const html = this.getWelcomeEmail(userName, unsubscribeUrl);
    return this.sendEmailAsync({
      to: email,
      subject: 'Welcome to Hopladay!',
      html,
      unsubscribeToken,
    });
  }
}

// Export singleton instance
export default new EmailService();

