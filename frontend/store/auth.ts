import { create } from "zustand";

export type AuthUser = {
  _id: string;
  name?: string;
  phone: string;
  role?: string;
  isPhoneVerified?: boolean;
};

export type AuthState = {
  user: AuthUser | null;
  phone: string | null;
  userId: string | null;
  profileStatus: {
    hasProfile: boolean;
    role?: string;
    profileType?: "user" | "teacher" | null;
    profileSummary?: Record<string, unknown> | null;
  } | null;
  setUser: (user: AuthUser | null) => void;
  setPhone: (phone: string | null) => void;
  setUserId: (userId: string | null) => void;
  setProfileStatus: (status: AuthState["profileStatus"]) => void;
  clearUser: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  phone: null,
  userId: null,
  profileStatus: null,
  setUser: (user) => set({ user }),
  setPhone: (phone) => set({ phone }),
  setUserId: (userId) => set({ userId }),
  setProfileStatus: (profileStatus) => set({ profileStatus }),
  clearUser: () => set({ user: null, phone: null, userId: null }),
}));


