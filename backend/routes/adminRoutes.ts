import { Router } from "express";
import { listUsers, updateUserRole, uploadQuestionPdf } from "../controllers/adminControllers";
import { isAuthenticated, isAdmin } from "../middlewares/auth";
import multer from "multer";
import path from "path";
import fs from "fs";

const adminRouter = Router();

// Ensure uploads directory exists
const uploadDir = path.resolve(process.cwd(), "uploads");
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch {}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeOriginal = file.originalname.replace(/\s+/g, "_");
    const timestamp = Date.now();
    cb(null, `${timestamp}_${safeOriginal}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
});

adminRouter.get("/users", isAuthenticated, isAdmin, listUsers);
adminRouter.patch("/users/:userId/role", isAuthenticated, isAdmin, updateUserRole);
adminRouter.post(
  "/question-pdfs/upload",
  isAuthenticated,
  isAdmin,
  upload.single("pdf"),
  uploadQuestionPdf
);

export default adminRouter;


