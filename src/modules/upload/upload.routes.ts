import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { env } from '@/config/env'
import { AppError } from '@/lib/AppError'
import { requireStaff } from '@/middlewares/auth'

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })

// SVG is excluded on purpose: it can carry scripts.
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
}

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // Random names, never the client's file name.
    filename: (_req, file, done) => done(null, `${Date.now()}-${randomBytes(8).toString('hex')}${EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => {
    if (EXTENSIONS[file.mimetype]) done(null, true)
    else done(new AppError(400, 'Upload a JPG, PNG, WebP, GIF or AVIF image'))
  },
})

const handleUpload = (req: Request, res: Response) => {
  if (!req.file) throw new AppError(400, 'Choose an image to upload')
  res.status(201).json({ success: true, data: { url: `${env.publicUrl}/uploads/${req.file.filename}` } })
}

export const adminUploadRoutes = Router().use(requireStaff).post('/', upload.single('file'), handleUpload)
