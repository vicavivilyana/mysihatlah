import type { OtpProvider } from './OtpProvider.ts';
import { MockOtpProvider } from './MockOtpProvider.ts';
import { TwilioOtpProvider } from './TwilioOtpProvider.ts';
import { optionalEnv } from '../env.ts';

export type { OtpProvider, OtpSendResult } from './OtpProvider.ts';

/** Select the OTP provider from OTP_PROVIDER (defaults to mock for the pilot). */
export function getOtpProvider(): OtpProvider {
  const choice = (optionalEnv('OTP_PROVIDER') ?? 'mock').toLowerCase();
  switch (choice) {
    case 'twilio':
      return new TwilioOtpProvider();
    case 'mock':
      return new MockOtpProvider();
    default:
      console.error(`[otp] Unknown OTP_PROVIDER "${choice}" — expected "mock" or "twilio". Falling back to mock.`);
      return new MockOtpProvider();
  }
}

/** Only the mock provider may leak the code back to the client (dev mode). */
export function isDevProvider(p: OtpProvider): boolean {
  return p.name === 'mock';
}
