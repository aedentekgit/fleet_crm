import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Uploads directory configuration
const defaultUploadsDir = path.resolve(__dirname, '../uploads');
const UPLOADS_DIR = process.env.UPLOADS_DIR || defaultUploadsDir;

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer disk storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    cb(null, `${cleanName}_${uniqueSuffix}${ext}`);
  }
});

// File filter (images, PDFs, documents)
const fileFilter = (req, file, cb) => {
  const allowedExts = /\.(jpg|jpeg|png|gif|webp|svg|pdf|doc|docx|xls|xlsx|txt|csv)$/i;
  if (allowedExts.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('File format not allowed. Allowed types: Images (JPG, PNG, WebP, GIF, SVG), PDFs, and Documents.'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max limit
  fileFilter
});

export const multerUploadMiddleware = upload.array('files', 10);

export default async function uploadHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || '';

  try {
    // ── POST: File Upload (Multipart OR Base64 JSON) ──
    if (req.method === 'POST') {
      // 1. Check if multipart files were parsed by Multer
      if (req.files && req.files.length > 0) {
        const uploadedFiles = req.files.map(f => ({
          filename: f.filename,
          original_name: f.originalname,
          size: f.size,
          mimetype: f.mimetype,
          url: `${baseUrl}/uploads/${f.filename}`,
          uploaded_at: new Date().toISOString()
        }));

        return res.status(200).json({
          success: true,
          files: uploadedFiles,
          url: uploadedFiles[0]?.url,
          filename: uploadedFiles[0]?.filename
        });
      }

      if (req.file) {
        const fileInfo = {
          filename: req.file.filename,
          original_name: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          url: `${baseUrl}/uploads/${req.file.filename}`,
          uploaded_at: new Date().toISOString()
        };

        return res.status(200).json({
          success: true,
          files: [fileInfo],
          url: fileInfo.url,
          filename: fileInfo.filename
        });
      }

      // 2. Base64 JSON payload fallback
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }

      const { dataUrl, base64, filename: origFilename, name } = body || {};
      const fileData = dataUrl || base64;

      if (fileData && typeof fileData === 'string') {
        let rawBase64 = fileData;
        let mime = 'application/octet-stream';

        const match = fileData.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mime = match[1];
          rawBase64 = match[2];
        }

        const extMap = {
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/webp': '.webp',
          'image/gif': '.gif',
          'image/svg+xml': '.svg',
          'application/pdf': '.pdf'
        };

        const targetName = origFilename || name || 'upload';
        const parsedExt = path.extname(targetName).toLowerCase() || extMap[mime] || '.bin';
        const cleanBase = path.basename(targetName, parsedExt).replace(/[^a-zA-Z0-9_-]/g, '_');
        const finalFilename = `${cleanBase}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${parsedExt}`;
        const filePath = path.join(UPLOADS_DIR, finalFilename);

        const buffer = Buffer.from(rawBase64, 'base64');
        fs.writeFileSync(filePath, buffer);

        const fileInfo = {
          filename: finalFilename,
          original_name: targetName,
          size: buffer.length,
          mimetype: mime,
          url: `${baseUrl}/uploads/${finalFilename}`,
          uploaded_at: new Date().toISOString()
        };

        return res.status(200).json({
          success: true,
          files: [fileInfo],
          url: fileInfo.url,
          filename: fileInfo.filename
        });
      }

      return res.status(400).json({ error: 'No files or base64 data provided' });
    }

    // ── GET: Check / List Uploads ──
    if (req.method === 'GET') {
      const targetFile = req.query.file || req.query.filename;
      if (targetFile) {
        const safeFile = path.basename(String(targetFile));
        const filePath = path.join(UPLOADS_DIR, safeFile);
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          return res.status(200).json({
            exists: true,
            filename: safeFile,
            size: stat.size,
            url: `${baseUrl}/uploads/${safeFile}`,
            created_at: stat.birthtime
          });
        }
        return res.status(404).json({ exists: false, error: 'File not found' });
      }

      // Return uploads directory info
      const files = fs.readdirSync(UPLOADS_DIR)
        .filter(f => !f.startsWith('.'))
        .map(f => {
          const stat = fs.statSync(path.join(UPLOADS_DIR, f));
          return {
            filename: f,
            size: stat.size,
            url: `${baseUrl}/uploads/${f}`,
            created_at: stat.birthtime
          };
        });

      return res.status(200).json({
        total: files.length,
        files: files.slice(0, 50)
      });
    }

    // ── DELETE: Remove File from Disk ──
    if (req.method === 'DELETE') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }

      const targetFile = req.query.file || req.query.filename || body?.file || body?.filename;
      if (!targetFile) {
        return res.status(400).json({ error: 'Filename is required for deletion' });
      }

      const safeFile = path.basename(String(targetFile));
      const filePath = path.join(UPLOADS_DIR, safeFile);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return res.status(200).json({ success: true, message: `File ${safeFile} deleted successfully` });
      }

      return res.status(404).json({ success: false, error: 'File not found on disk' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Upload Handler Error]:', error);
    return res.status(500).json({ error: error.message || 'File operation failed' });
  }
}
