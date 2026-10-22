import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { notFound } from '@/lib/AppError'
import { optionalStoreDate } from '@/lib/dates'
import { httpUrl, optionalText } from '@/lib/phone'
import { created, ok } from '@/lib/respond'
import { objectIdParam, validateBody } from '@/lib/validate'
import { requireStaff } from '@/middlewares/auth'
import BannerModel, { BANNER_THEMES } from '@/modules/banner/banner.model'

// Links are site paths ("/shop?deals=1") or full http(s) URLs. "//host" is refused: browsers read it
// as a link to another website.
const link = z.union([z.string().trim().regex(/^\/(?!\/)[^\s]*$/, 'Use a path like /shop or a full URL'), httpUrl(), z.literal('')])

const bannerSchema = z
  .object({
    eyebrow: z.string().trim().max(60).default(''),
    title: z.string().trim().min(1).max(120),
    text: z.string().trim().max(300).default(''),
    imageUrl: optionalText(httpUrl()).nullable(),
    ctaLabel: z.string().trim().min(1).max(40),
    ctaLink: link,
    secondaryLabel: z.string().trim().max(40).default(''),
    secondaryLink: link.default(''),
    theme: z.enum(BANNER_THEMES).default('light'),
    sortOrder: z.coerce.number().int().default(0),
    isActive: z.boolean().default(true),
    // A date like "2026-10-15" means that whole day in Dhaka: shown from its start, until its end.
    startsAt: optionalStoreDate('start'),
    endsAt: optionalStoreDate('end'),
  })
  .refine((value) => !value.startsAt || !value.endsAt || value.endsAt > value.startsAt, {
    message: 'End date must be after the start date',
    path: ['endsAt'],
  })
  .refine((value) => !value.secondaryLabel || value.secondaryLink, {
    message: 'Add a link for the second button',
    path: ['secondaryLink'],
  })

// Active banners whose schedule includes the current moment.
const listPublic = async (req: Request, res: Response) => {
  const now = new Date()
  const banners = await BannerModel.find({
    isActive: true,
    $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] }],
  }).sort({ sortOrder: 1, createdAt: 1 })
  ok(res, banners)
}

const listAdmin = async (req: Request, res: Response) => {
  ok(res, await BannerModel.find().sort({ sortOrder: 1, createdAt: 1 }))
}

const create = async (req: Request, res: Response) => {
  created(res, await BannerModel.create(req.body))
}

const update = async (req: Request, res: Response) => {
  const banner = await BannerModel.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true })
  if (!banner) throw notFound('Banner')
  ok(res, banner)
}

const remove = async (req: Request, res: Response) => {
  const banner = await BannerModel.findByIdAndDelete(req.params.id)
  if (!banner) throw notFound('Banner')
  ok(res, null)
}

export const publicBannerRoutes = Router().get('/', listPublic)

export const adminBannerRoutes = Router()
  .param('id', objectIdParam)
  .use(requireStaff)
  .get('/', listAdmin)
  .post('/', validateBody(bannerSchema), create)
  .put('/:id', validateBody(bannerSchema), update)
  .delete('/:id', remove)
