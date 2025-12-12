import { Router } from "express";
import { listUsers, updateUserRole, uploadQuestionPdf, generateQuestionMetadata, saveQuestionsBatch, generateQuestionPaper, generateQuestionPaperv1_5, generateQuestionPaperv2 } from "../controllers/adminControllers";
import { isAuthenticated, isAdmin } from "../middlewares/auth";

const adminRouter = Router();

adminRouter.get("/users", isAuthenticated, isAdmin, listUsers);
adminRouter.patch("/users/:userId/role", isAuthenticated, isAdmin, updateUserRole);
adminRouter.post("/question-pdfs/process", isAuthenticated, isAdmin, uploadQuestionPdf);
adminRouter.post("/questions/auto-metadata", isAuthenticated, isAdmin, generateQuestionMetadata);
adminRouter.post("/questions/batch", isAuthenticated, isAdmin, saveQuestionsBatch);
adminRouter.post("/papers/generate", isAuthenticated, isAdmin, generateQuestionPaper);
adminRouter.post("/papers/generate-v1.5", isAuthenticated, isAdmin, generateQuestionPaperv1_5);
adminRouter.post("/papers/generate-v2", isAuthenticated, isAdmin, generateQuestionPaperv2);

export default adminRouter;


