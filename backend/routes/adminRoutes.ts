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

// Question Paper CRUD routes
adminRouter.post("/papers", isAuthenticated, isAdmin, createQuestionPaper);
adminRouter.get("/papers", isAuthenticated, isAdmin, listQuestionPapers);
adminRouter.get("/papers/:paperId", isAuthenticated, isAdmin, getQuestionPaper);
adminRouter.put("/papers/:paperId", isAuthenticated, isAdmin, updateQuestionPaper);
adminRouter.delete("/papers/:paperId", isAuthenticated, isAdmin, deleteQuestionPaper);
adminRouter.post("/papers/:paperId/duplicate", isAuthenticated, isAdmin, duplicateQuestionPaper);
// Question-level operations within a paper
adminRouter.post("/papers/:paperId/questions", isAuthenticated, isAdmin, addQuestionToPaper);
adminRouter.put("/papers/:paperId/questions/:questionId", isAuthenticated, isAdmin, updateQuestionInPaper);
adminRouter.delete("/papers/:paperId/questions/:questionId", isAuthenticated, isAdmin, deleteQuestionFromPaper);

export default adminRouter;


