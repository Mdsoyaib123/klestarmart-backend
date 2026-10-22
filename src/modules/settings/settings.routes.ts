import { Router, type Request, type Response } from 'express'
import { ok } from '@/lib/respond'
import { validateBody } from '@/lib/validate'
import { requireAdmin, requireStaff } from '@/middlewares/auth'
import SettingsModel, { getSettings } from '@/modules/settings/settings.model'
import { settingsSchema } from '@/modules/settings/settings.validation'

const read = async (req: Request, res: Response) => {
  ok(res, await getSettings())
}

const update = async (req: Request, res: Response) => {
  await getSettings()
  const settings = await SettingsModel.findOneAndUpdate({ key: 'site' }, req.body, { returnDocument: 'after', runValidators: true })
  ok(res, settings)
}

export const publicSettingsRoutes = Router().get('/', read)

export const adminSettingsRoutes = Router().use(requireStaff).get('/', read).put('/', requireAdmin, validateBody(settingsSchema), update)
