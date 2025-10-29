import type { AuthUser } from "@/store/auth";

export type OnboardingResponse = {
  success: boolean;
  message: string;
  userId?: string;
};

export type VerifyOtpResponse = {
  success: boolean;
  message: string;
  token?: string;
  user?: AuthUser;
  role?: string;
  isProfileComplete?: boolean;
};


