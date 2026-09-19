import type { OtpProvider, OtpSendResult } from './OtpProvider.ts';

/**
 * Pilot OTP provider. "Sends" the code by logging it server-side and returning
 * it in the response so the flow is fully testable with zero SMS cost.
 * The returned devCode is what the client shows in the "Dev mode" hint.
 */
export class MockOtpProvider implements OtpProvider {
  readonly name = 'mock';
  send(phone: string, code: string): Promise<OtpSendResult> {
    console.log(`[MockOtpProvider] OTP for ${phone}: ${code}`);
    return Promise.resolve({ devCode: code });
  }
}
