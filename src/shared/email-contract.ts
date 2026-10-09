/** Email addresses and message content never cross the report request boundary. */
export type ReportEmailType =
  | "workout"
  | "weekly"
  | "monthly"
  | "skincare"
  | "health";
export type EmailRequest =
  | { reportType: ReportEmailType; reportId: string }
  | { reportType: "test" | "welcome" }
  | { reportType: "hard-reset"; code: string }
  | { reportType: "feedback"; category: string; message: string };
export const EMAIL_MESSAGES = {
  AUTH_REQUIRED: "Sign in to Health OS to send email.",
  EMAIL_NOT_AVAILABLE: "Your account has no primary email.",
  EMAIL_NOT_VERIFIED: "Confirm your account email before sending reports.",
  REPORT_NOT_FOUND: "Sync this report to your account before sending it.",
  REPORT_NOT_AUTHORIZED: "This report is not available to your account.",
  REPORT_GENERATION_FAILED: "AI report generation failed. Check your AI connection and try again.",
  EMAIL_DELIVERY_FAILED:
    "Health OS could not deliver this email. Please try again later.",
  EMAIL_RATE_LIMITED: "Please wait before sending another email.",
  EMAIL_PREFERENCE_DISABLED: "Automatic email for this report is disabled.",
  INVALID_EMAIL_REQUEST: "Choose a valid saved report.",
} as const;
export class EmailError extends Error {
  constructor(public code: keyof typeof EMAIL_MESSAGES) {
    super(EMAIL_MESSAGES[code]);
  }
}
export function parseEmailRequest(input: unknown): EmailRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new EmailError("INVALID_EMAIL_REQUEST");
  }
  const value = input as Record<string, unknown>;
  const type = value.reportType;
  const keys = type === "hard-reset"
    ? ["reportType", "code"]
    : type === "feedback"
    ? ["reportType", "category", "message"]
    : type === "test" || type === "welcome"
    ? ["reportType"]
    : ["reportType", "reportId"];
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new EmailError("INVALID_EMAIL_REQUEST");
  }
  if (type === "test" || type === "welcome") return { reportType: type };
  if (
    type === "hard-reset" && typeof value.code === "string" &&
    /^\d{6}$/.test(value.code)
  ) return { reportType: type, code: value.code };
  if (
    type === "feedback" && typeof value.category === "string" &&
    value.category.length <= 50 && typeof value.message === "string" &&
    value.message.length >= 10 && value.message.length <= 6000
  ) {
    return {
      reportType: type,
      category: value.category,
      message: value.message,
    };
  }
  if (
    ["workout", "weekly", "monthly", "skincare", "health"].includes(
      String(type),
    ) && typeof value.reportId === "string" &&
    /^[\w:-]{1,160}$/.test(value.reportId)
  ) {
    return { reportType: type as ReportEmailType, reportId: value.reportId };
  }
  throw new EmailError("INVALID_EMAIL_REQUEST");
}


