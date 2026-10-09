// compliance.ts — legally-required copy, versioned. Copy changes ship as a new
// version; stored records keep pointing at the version shown. (Sources:
// docs/25-nigeria-compliance.md where stated; generic consent wording kept
// minimal and clearly marked — expand only from counsel-approved text.)
export const COMPLIANCE_COPY_VERSION = "v1" as const;

export const COMPLIANCE_COPY = {
  version: COMPLIANCE_COPY_VERSION,
  otpConsent: "By requesting this code you agree to receive an SMS from Courtland at this number.",
  marketingOptIn:
    "Courtland may send you property alerts by SMS, WhatsApp or email. Reply STOP to opt out at any time.",
  kycNotice:
    "Your identification details are collected to verify your identity as required by law and are stored securely.",
} as const;
export type ComplianceCopy = typeof COMPLIANCE_COPY;
