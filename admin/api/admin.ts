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

export async function uploadQuestionPdf(params: { file: any; startPage: number; numPages: number }) {
  const form = new FormData();
  form.append("startPage", String(params.startPage));
  form.append("numPages", String(params.numPages));
  form.append("pdf", params.file);

  const resp = await apiClient.post(`/api/admin/question-pdfs/upload`, form, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return resp.data as any;
}


