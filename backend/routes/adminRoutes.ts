import { Router } from "express";
import { listUsers, updateUserRole, uploadQuestionPdf } from "../controllers/adminControllers";
import { isAuthenticated, isAdmin } from "../middlewares/auth";

const adminRouter = Router();

adminRouter.get("/users", isAuthenticated, isAdmin, listUsers);
adminRouter.patch("/users/:userId/role", isAuthenticated, isAdmin, updateUserRole);
adminRouter.post("/question-pdfs/process", isAuthenticated, isAdmin, uploadQuestionPdf);

export default adminRouter;


