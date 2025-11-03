import apiClient from "./client";

export type AdminUser = {
  _id: string;
  name?: string;
  phone: string;
  role: "user" | "teacher" | "admin";
  isPhoneVerified: boolean;
  createdAt?: string;
};

export type ListUsersResponse = {
  success: boolean;
  data: AdminUser[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export async function listUsers(params: { search?: string; role?: string; page?: number; limit?: number } = {}) {
  const resp = await apiClient.get<ListUsersResponse>("/api/admin/users", { params });
  return resp.data;
}

export async function updateUserRole(userId: string, role: "user" | "teacher" | "admin") {
  const resp = await apiClient.patch<{ success: boolean; user: AdminUser }>(`/api/admin/users/${userId}/role`, { role });
  return resp.data;
}


