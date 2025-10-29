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
  setUser: (user: AuthUser | null) => void;
  setPhone: (phone: string | null) => void;
  setUserId: (userId: string | null) => void;
  clearUser: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  phone: null,
  userId: null,
  setUser: (user) => set({ user }),
  setPhone: (phone) => set({ phone }),
  setUserId: (userId) => set({ userId }),
  clearUser: () => set({ user: null, phone: null, userId: null }),
}));


