import { Router, type Request, type Response } from 'express'
import { validateBody } from '@/lib/validate'
import { requireAdmin, requireStaff } from '@/middlewares/auth'
import SettingsModel, { getSettings } from '@/modules/settings/settings.model'
import { settingsSchema } from '@/modules/settings/settings.validation'

const read = async (req: Request, res: Response) => {
  res.json({ success: true, data: await getSettings() })
}

const update = async (req: Request, res: Response) => {
  await getSettings()
  const settings = await SettingsModel.findOneAndUpdate({ key: 'site' }, req.body, { returnDocument: 'after', runValidators: true })
  res.json({ success: true, data: settings })
}

export const publicSettingsRoutes = Router().get('/', read)

export const adminSettingsRoutes = Router().use(requireStaff).get('/', read).put('/', requireAdmin, validateBody(settingsSchema), update)
