import type { CustomRequest } from "../types";
import { generateUploadUrl, uploadBufferToR2 } from "../utils/fileupload";
import type { Response } from "express";

// Request file upload URL (for documents, diagrams, images, etc.)
export const getUploadUrl = async (req: CustomRequest, res: Response): Promise<void> => {
    try {
        const { fileType, fileName, isPermanent } = req.body;

        if (!fileType || !fileName) {
            res.status(400).json({ message: 'File type and name are required' });
            return;
        }
        if (!req.user || !req.user._id || !req.user.role) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        // Generate a presigned URL for uploading
        const { uploadUrl, publicUrl } = await generateUploadUrl(
            fileType,
            fileName,
            req.user.role,
            req.user._id.toString(),
            // Treat application/* (e.g., PDFs, Office docs) as permanent by default
            Boolean(isPermanent) || String(fileType).toLowerCase().startsWith('application/')
        );

        res.status(200).json({ uploadUrl, publicUrl });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Direct upload endpoint: accepts base64 content and uploads server-side to avoid CORS
export const uploadDirect = async (req: CustomRequest, res: Response): Promise<void> => {
    try {
        const { fileType, fileName, dataBase64, isPermanent } = req.body as {
            fileType?: string;
            fileName?: string;
            dataBase64?: string;
            isPermanent?: boolean;
        };

        if (!fileType || !fileName || !dataBase64) {
            res.status(400).json({ message: 'fileType, fileName and dataBase64 are required' });
            return;
        }
        if (!req.user || !req.user._id || !req.user.role) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        // dataBase64 might include a data URL prefix; strip if present
        const commaIndex = dataBase64.indexOf(',');
        const base64 = commaIndex >= 0 ? dataBase64.slice(commaIndex + 1) : dataBase64;
        const buffer = Buffer.from(base64, 'base64');

        const { publicUrl } = await uploadBufferToR2(
            buffer,
            fileType,
            fileName,
            req.user.role,
            req.user._id.toString(),
            Boolean(isPermanent) || String(fileType).toLowerCase().startsWith('application/')
        );

        res.status(200).json({ publicUrl });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};