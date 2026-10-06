import { AppError } from '@/lib/AppError'
import { normalizePhone } from '@/lib/phone'
import { hashPassword, verifyPassword } from '@/lib/password'
import UserModel, { STAFF_ROLES } from '@/modules/user/user.model'

const INVALID_LOGIN = 'Incorrect login details'

export const registerCustomer = async (input: { name: string; phone: string; email?: string; password: string }) => {
  const passwordHash = await hashPassword(input.password)
  const existing = await UserModel.findOne({ phone: input.phone }).select('+passwordHash')

  if (existing) {
    if (existing.role !== 'customer' || existing.passwordHash) {
      throw new AppError(409, 'An account with this phone number already exists. Please log in.')
    }
    if (existing.status === 'blocked') throw new AppError(403, 'This account has been suspended. Please contact support.')
    // A guest who ordered before now claims their account, keeping their order history.
    existing.set({ name: input.name, email: input.email ?? existing.email, passwordHash, lastLoginAt: new Date() })
    return existing.save()
  }

  return UserModel.create({ ...input, passwordHash, role: 'customer', lastLoginAt: new Date() })
}

export const loginCustomer = async (identifier: string, password: string) => {
  const query = identifier.includes('@') ? { email: identifier.toLowerCase() } : { phone: normalizePhone(identifier) }
  const user = await UserModel.findOne({ ...query, role: 'customer' }).select('+passwordHash')
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) throw new AppError(401, INVALID_LOGIN)
  if (user.status === 'blocked') throw new AppError(403, 'This account has been suspended. Please contact support.')
  user.lastLoginAt = new Date()
  return user.save()
}

export const loginStaff = async (email: string, password: string) => {
  const user = await UserModel.findOne({ email, role: { $in: STAFF_ROLES } }).select('+passwordHash')
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) throw new AppError(401, INVALID_LOGIN)
  if (user.status === 'blocked') throw new AppError(403, 'This account has been deactivated.')
  user.lastLoginAt = new Date()
  return user.save()
}

export const changePassword = async (userId: string, currentPassword: string, newPassword: string) => {
  const user = await UserModel.findById(userId).select('+passwordHash')
  if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'Your current password is incorrect')
  }
  user.passwordHash = await hashPassword(newPassword)
  await user.save()
}

export const getProfile = (userId: string) => UserModel.findById(userId)
