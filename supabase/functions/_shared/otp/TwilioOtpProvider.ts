import type { OtpProvider, OtpSendResult } from './OtpProvider.ts';
import { requireEnv } from '../env.ts';

/**
 * Example real-SMS adapter (Twilio). Selected with OTP_PROVIDER=twilio plus
 * TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER. No UI or
 * endpoint change is needed — only the factory picks this up.
 */
export class TwilioOtpProvider implements OtpProvider {
  readonly name = 'twilio';
  async send(phone: string, code: string): Promise<OtpSendResult> {
    const sid = requireEnv('TWILIO_ACCOUNT_SID', 'otp/twilio');
    const token = requireEnv('TWILIO_AUTH_TOKEN', 'otp/twilio');
    const from = requireEnv('TWILIO_FROM_NUMBER', 'otp/twilio');

    const body = new URLSearchParams({
      To: phone,
      From: from,
      Body: `Your HealthGo verification code is ${code}. It expires in 5 minutes.`,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) throw new Error(`Twilio send failed: HTTP ${res.status}`);
    return {}; // never return the code for a real provider
  }
}
