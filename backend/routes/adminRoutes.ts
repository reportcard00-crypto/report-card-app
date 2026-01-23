import { Router } from "express";
import { 
  listUsers, 
  updateUserRole, 
  uploadQuestionPdf, 
  uploadQuestionPdfStream, 
  getUploadHistory, 
  getSessionQuestions, 
  getSessionStatus, 
  getActiveSessions,
  deleteUploadSession,
  cleanupStuckSessions,
  deleteAllProcessingSessions,
  generateQuestionMetadata, 
  saveQuestionsBatch, 
  generateQuestionPaper, 
  generateQuestionPaperv1_5, 
  generateQuestionPaperv2,
  // Question Paper CRUD
  createQuestionPaper,
  listQuestionPapers,
  getQuestionPaper,
  updateQuestionPaper,
  deleteQuestionPaper,
  duplicateQuestionPaper,
  updateQuestionInPaper,
  deleteQuestionFromPaper,
  addQuestionToPaper,
} from "../controllers/adminControllers";
import { isAuthenticated, isAdmin, isAdminOrTeacher } from "../middlewares/auth";

const adminRouter = Router();

// Admin-only routes
adminRouter.get("/users", isAuthenticated, isAdmin, listUsers);
adminRouter.patch("/users/:userId/role", isAuthenticated, isAdmin, updateUserRole);
adminRouter.post("/question-pdfs/process", isAuthenticated, isAdmin, uploadQuestionPdf);
adminRouter.post("/question-pdfs/process-stream", isAuthenticated, isAdmin, uploadQuestionPdfStream);
adminRouter.get("/upload-history", isAuthenticated, isAdmin, getUploadHistory);
adminRouter.get("/upload-history/:sessionId/questions", isAuthenticated, isAdmin, getSessionQuestions);
adminRouter.get("/upload-history/:sessionId/status", isAuthenticated, isAdmin, getSessionStatus);
adminRouter.get("/active-sessions", isAuthenticated, isAdmin, getActiveSessions);
adminRouter.delete("/upload-history/:sessionId", isAuthenticated, isAdmin, deleteUploadSession);
adminRouter.post("/upload-history/cleanup-stuck", isAuthenticated, isAdmin, cleanupStuckSessions);
adminRouter.delete("/upload-history/processing/all", isAuthenticated, isAdmin, deleteAllProcessingSessions);
adminRouter.post("/questions/auto-metadata", isAuthenticated, isAdmin, generateQuestionMetadata);
adminRouter.post("/questions/batch", isAuthenticated, isAdmin, saveQuestionsBatch);

// Paper generation routes - accessible by both admin and teacher
adminRouter.post("/papers/generate", isAuthenticated, isAdminOrTeacher, generateQuestionPaper);
adminRouter.post("/papers/generate-v1.5", isAuthenticated, isAdminOrTeacher, generateQuestionPaperv1_5);
adminRouter.post("/papers/generate-v2", isAuthenticated, isAdminOrTeacher, generateQuestionPaperv2);

// Question Paper CRUD routes - accessible by both admin and teacher
adminRouter.post("/papers", isAuthenticated, isAdminOrTeacher, createQuestionPaper);
adminRouter.get("/papers", isAuthenticated, isAdminOrTeacher, listQuestionPapers);
adminRouter.get("/papers/:paperId", isAuthenticated, isAdminOrTeacher, getQuestionPaper);
adminRouter.put("/papers/:paperId", isAuthenticated, isAdminOrTeacher, updateQuestionPaper);
adminRouter.delete("/papers/:paperId", isAuthenticated, isAdminOrTeacher, deleteQuestionPaper);
adminRouter.post("/papers/:paperId/duplicate", isAuthenticated, isAdminOrTeacher, duplicateQuestionPaper);
// Question-level operations within a paper
adminRouter.post("/papers/:paperId/questions", isAuthenticated, isAdminOrTeacher, addQuestionToPaper);
adminRouter.put("/papers/:paperId/questions/:questionId", isAuthenticated, isAdminOrTeacher, updateQuestionInPaper);
adminRouter.delete("/papers/:paperId/questions/:questionId", isAuthenticated, isAdminOrTeacher, deleteQuestionFromPaper);

export default adminRouter;


