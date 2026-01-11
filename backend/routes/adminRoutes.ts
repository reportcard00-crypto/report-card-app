import { Router } from "express";
import { listUsers, updateUserRole, uploadQuestionPdf, uploadQuestionPdfStream, getUploadHistory, getSessionQuestions, getSessionStatus, getActiveSessions, generateQuestionMetadata, saveQuestionsBatch, generateQuestionPaper, generateQuestionPaperv1_5, generateQuestionPaperv2 } from "../controllers/adminControllers";
import { isAuthenticated, isAdmin } from "../middlewares/auth";

const adminRouter = Router();

adminRouter.get("/users", isAuthenticated, isAdmin, listUsers);
adminRouter.patch("/users/:userId/role", isAuthenticated, isAdmin, updateUserRole);
adminRouter.post("/question-pdfs/process", isAuthenticated, isAdmin, uploadQuestionPdf);
adminRouter.post("/question-pdfs/process-stream", isAuthenticated, isAdmin, uploadQuestionPdfStream);
adminRouter.get("/upload-history", isAuthenticated, isAdmin, getUploadHistory);
adminRouter.get("/upload-history/:sessionId/questions", isAuthenticated, isAdmin, getSessionQuestions);
adminRouter.get("/upload-history/:sessionId/status", isAuthenticated, isAdmin, getSessionStatus);
adminRouter.get("/active-sessions", isAuthenticated, isAdmin, getActiveSessions);
adminRouter.post("/questions/auto-metadata", isAuthenticated, isAdmin, generateQuestionMetadata);
adminRouter.post("/questions/batch", isAuthenticated, isAdmin, saveQuestionsBatch);
adminRouter.post("/papers/generate", isAuthenticated, isAdmin, generateQuestionPaper);
adminRouter.post("/papers/generate-v1.5", isAuthenticated, isAdmin, generateQuestionPaperv1_5);
adminRouter.post("/papers/generate-v2", isAuthenticated, isAdmin, generateQuestionPaperv2);

export default adminRouter;


