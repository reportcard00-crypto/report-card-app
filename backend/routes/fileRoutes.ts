import { Router } from "express";
import { getUploadUrl, uploadDirect } from "../controllers/fileController";
import { isAuthenticated } from "../middlewares/auth";

const fileRoutes = Router();

fileRoutes.post('/upload', isAuthenticated, getUploadUrl);
fileRoutes.post('/upload-direct', isAuthenticated, uploadDirect);

export default fileRoutes;