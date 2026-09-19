// OTP delivery provider interface. The pilot ships MockOtpProvider (no SMS
// cost — logs the code and returns it in dev). A real Malaysian SMS gateway
// (Twilio / MessageBird / local) drops in as one more adapter selected by the
// OTP_PROVIDER env var — no change to otp-request / otp-verify.

export interface OtpSendResult {
  /** Present only for the mock provider so the pilot is testable without SMS. */
  devCode?: string;
}

export interface OtpProvider {
  readonly name: string;
  send(phone: string, code: string): Promise<OtpSendResult>;
}
