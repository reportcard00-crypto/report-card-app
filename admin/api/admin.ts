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

// 1) Ask backend for a presigned slot to upload a PDF to R2
export async function getQuestionPdfUploadSlot(options?: { fileType?: string; fileName?: string; isPermanent?: boolean }) {
  const fileType = options?.fileType ?? "application/pdf";
  const fileName = options?.fileName ?? "question.pdf";
  const isPermanent = options?.isPermanent ?? true;
  const resp = await apiClient.post<{ uploadUrl: string; publicUrl: string }>("/api/file/upload", {
    fileType,
    fileName,
    isPermanent,
  });
  return resp.data;
}

// 2) Server-side upload to R2 to avoid CORS (accepts base64 string)
export async function uploadPdfDirect(params: { dataBase64: string; fileType?: string; fileName?: string; isPermanent?: boolean }) {
  const resp = await apiClient.post<{ publicUrl: string }>("/api/file/upload-direct", {
    fileType: params.fileType ?? "application/pdf",
    fileName: params.fileName ?? "question.pdf",
    dataBase64: params.dataBase64,
    isPermanent: params.isPermanent ?? true,
  });
  return resp.data;
}

// 3) Tell backend to process the already-uploaded PDF by its public URL
export async function processQuestionPdf(params: { pdfUrl: string; startPage: number; numPages: number }) {
  const resp = await apiClient.post(`/api/admin/question-pdfs/process`, {
    startPage: params.startPage,
    numPages: params.numPages,
    fileUrl: params.pdfUrl,
  });
  return resp.data as any;
}


