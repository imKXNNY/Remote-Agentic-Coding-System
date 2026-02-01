import { Router } from 'express';
import multer from 'multer';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir } from 'fs/promises';

const router = Router();

// Ensure upload directory exists
const uploadDir = join(tmpdir(), 'remote-agent-uploads');

// Initialize upload storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    mkdir(uploadDir, { recursive: true })
      .then(() => {
        cb(null, uploadDir);
      })
      .catch(error => {
        cb(error as Error, '');
      });
  },
  filename: (_req, file, cb) => {
    // Keep original extension, add timestamp for uniqueness
    const timestamp = Date.now().toString();
    const randomPart = Math.round(Math.random() * 1e9).toString();
    const uniqueSuffix = `${timestamp}-${randomPart}`;
    const ext = file.originalname.split('.').pop() ?? 'dat';
    cb(null, `${file.fieldname}-${uniqueSuffix}.${ext}`);
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * POST /api/upload
 * Handle single file upload
 */
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Return the absolute path for backend use
  return res.json({
    success: true,
    path: req.file.path,
    filename: req.file.filename,
    originalName: req.file.originalname
  });
});

export default router;
