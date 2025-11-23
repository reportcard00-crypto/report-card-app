import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

// Configure AWS SDK v3
const s3Client = new S3Client({
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY || '',
        secretAccessKey: process.env.R2_SECRET_KEY || '',
    },
    region: 'auto'
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'klinic-bucket';
const PUBLIC_BASE_URL =
    process.env.R2_PUBLIC_BASE_URL ||
    (process.env.R2_PUBLIC_DOMAIN ? `https://${process.env.R2_PUBLIC_DOMAIN}` : 'https://pub-0f703feb53794f768ba649b826a64db4.r2.dev');

// Generate a presigned URL for file upload
export const generateUploadUrl = async (
    fileType: string, 
    fileName: string, 
    role: string, 
    userId: string, 
    isPermanent: boolean = false
): Promise<{ uploadUrl: string; publicUrl: string }> => {
    try {
        const fileExtension = fileName.split('.').pop();
        const uniqueFileName = `${uuidv4()}.${fileExtension}`;

        // Determine the appropriate, generic path based on content type and permanence
        const key = deriveObjectKey({
            fileType,
            fileExtension: fileExtension || '',
            role,
            userId,
            uniqueFileName,
            isPermanent
        });

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: fileType || getMimeType(fileExtension || ''),
            // Let PDFs (and most docs) be viewable inline when accessed via signed URLs
            // Public distribution behavior depends on R2/CDN headers
            ContentDisposition: fileType === 'application/pdf' ? 'inline' : undefined
        });

        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
        
        // Generate the public URL that will be accessible after upload
        const publicUrl = `${PUBLIC_BASE_URL}/${key}`;
        
        return { uploadUrl, publicUrl };
    } catch (error) {
        console.error('Error generating upload URL:', error);
        throw new Error('Failed to generate upload URL');
    }
};

// Upload a file buffer directly to R2 (server-side), returning its public URL
export const uploadBufferToR2 = async (
    buffer: Buffer,
    fileType: string,
    fileName: string,
    role: string,
    userId: string,
    isPermanent: boolean = false
): Promise<{ publicUrl: string; key: string }> => {
    try {
        const fileExtension = fileName.split('.').pop();
        const uniqueFileName = `${uuidv4()}.${fileExtension}`;

        const key = deriveObjectKey({
            fileType,
            fileExtension: fileExtension || '',
            role,
            userId,
            uniqueFileName,
            isPermanent
        });

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: fileType || getMimeType(fileExtension || ''),
            ContentDisposition: fileType === 'application/pdf' ? 'inline' : undefined
        });

        await s3Client.send(command);

        const publicUrl = `${PUBLIC_BASE_URL}/${key}`;
        return { publicUrl, key };
    } catch (error) {
        console.error('Error uploading buffer to R2:', error);
        throw new Error('Failed to upload file');
    }
};

// Delete file from R2 storage
export const deleteFileFromR2 = async (fileUrl: string): Promise<void> => {
    try {
        if (!fileUrl) return;
        
        // Extract the key from the URL
        // Example URL: https://pub-0f703feb53794f768ba649b826a64db4.r2.dev/user/6820f9377f5263b276ea76e9/33614f5c-084e-4725-b339-46056f7be568.pdf
        
        // Parse the URL to extract just the path portion
        const url = new URL(fileUrl);
        const key = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
        
        console.log(`Attempting to delete file with key: ${key}`);
        console.log(`Using bucket: ${BUCKET_NAME}`);
        
        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });
        
        await s3Client.send(command);
        console.log(`File deleted: ${key}`);
    } catch (error) {
        console.error('Error deleting file from R2:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        // We don't throw here to prevent the main operation from failing
        // if file deletion fails
    }
};

// Helper function to determine MIME type based on file extension
const getMimeType = (extension: string): string => {
    const mimeTypes: Record<string, string> = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'txt': 'text/plain',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'csv': 'text/csv',
        'json': 'application/json',
        'zip': 'application/zip'
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
}; 

type DeriveKeyParams = {
    fileType: string;
    fileExtension: string;
    role: string;
    userId: string;
    uniqueFileName: string;
    isPermanent: boolean;
};

const deriveObjectKey = (params: DeriveKeyParams): string => {
    const { fileType, fileExtension, role, userId, uniqueFileName, isPermanent } = params;
    const permanenceFolder = isPermanent ? 'permanent' : 'temp';

    const lowerExt = fileExtension.toLowerCase();
    const typePrefix = (fileType || '').toLowerCase();

    let categoryFolder = 'files';
    if (typePrefix.startsWith('image/')) {
        categoryFolder = 'images';
    } else if (typePrefix === 'application/pdf' || lowerExt === 'pdf') {
        categoryFolder = 'documents/pdfs';
    } else if (
        typePrefix.startsWith('application/vnd.openxmlformats-officedocument') ||
        typePrefix === 'application/msword' ||
        typePrefix === 'application/vnd.ms-excel' ||
        typePrefix === 'application/vnd.ms-powerpoint' ||
        ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(lowerExt)
    ) {
        categoryFolder = 'documents/office';
    } else if (typePrefix === 'text/csv' || lowerExt === 'csv') {
        categoryFolder = 'documents/spreadsheets';
    } else if (typePrefix === 'application/zip' || lowerExt === 'zip') {
        categoryFolder = 'archives';
    }

    // Final key structure:
    // {role}/{userId}/{permanent|temp}/{category}/<uuid>.<ext>
    return `${role}/${userId}/${permanenceFolder}/${categoryFolder}/${uniqueFileName}`;
};