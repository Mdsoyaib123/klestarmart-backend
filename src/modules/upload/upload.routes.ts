import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { env } from '@/config/env'
import { AppError } from '@/lib/AppError'
import { created } from '@/lib/respond'
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

const unsupported = () => new AppError(400, 'Upload a JPG, PNG, WebP, GIF or AVIF image', { code: 'UNSUPPORTED_FILE' })

// The browser's declared type can be faked, so the file's first bytes must match it too.
const matchesSignature = (mimetype: string, head: Buffer) => {
  const ascii = (start: number, end: number) => head.subarray(start, end).toString('latin1')
  switch (mimetype) {
    case 'image/jpeg':
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
    case 'image/png':
      return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    case 'image/gif':
      return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a'
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
    case 'image/avif':
      return ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))
    default:
      return false
  }
}

const readHead = async (file: string) => {
  const handle = await open(file, 'r')
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(16), 0, 16, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // Random names, never the client's file name.
    filename: (_req, file, done) => done(null, `${Date.now()}-${randomBytes(8).toString('hex')}${EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (_req, file, done) => {
    if (EXTENSIONS[file.mimetype]) done(null, true)
    else done(unsupported())
  },
})

const handleUpload = async (req: Request, res: Response) => {
  if (!req.file) throw new AppError(400, 'Choose an image to upload', { code: 'VALIDATION_ERROR', errors: [{ field: 'file', message: 'Required' }] })
  if (!matchesSignature(req.file.mimetype, await readHead(req.file.path))) {
    await unlink(req.file.path).catch(() => undefined)
    throw unsupported()
  }
  created(res, { url: `${env.publicUrl}/uploads/${req.file.filename}` })
}

export const adminUploadRoutes = Router().use(requireStaff).post('/', upload.single('file'), handleUpload)
