import { AppError, notFound } from '@/lib/AppError'
import { normalizePhone } from '@/lib/phone'
import { hashPassword, verifyAgainstDummy, verifyPassword } from '@/lib/password'
import UserModel, { STAFF_ROLES } from '@/modules/user/user.model'

const invalidLogin = () => new AppError(401, 'Incorrect login details', { code: 'INVALID_CREDENTIALS' })
const suspended = (message: string) => new AppError(403, message, { code: 'ACCOUNT_SUSPENDED' })

const SESSION_FIELDS = '+passwordHash +sessionVersion'

export const registerCustomer = async (input: { name: string; phone: string; email?: string; password: string }) => {
  const passwordHash = await hashPassword(input.password)
  const existing = await UserModel.findOne({ phone: input.phone }).select(SESSION_FIELDS)

  if (existing) {
    if (existing.role !== 'customer' || existing.passwordHash) {
      throw new AppError(409, 'An account with this phone number already exists. Please log in.', {
        code: 'DUPLICATE',
        errors: [{ field: 'phone', message: 'This phone number already has an account' }],
      })
    }
    if (existing.status === 'blocked') throw suspended('This account has been suspended. Please contact support.')
    // A guest who ordered before now claims their account, keeping their order history.
    existing.set({ name: input.name, email: input.email ?? existing.email, passwordHash, lastLoginAt: new Date() })
    return existing.save()
  }

  return UserModel.create({ ...input, passwordHash, role: 'customer', lastLoginAt: new Date() })
}

export const loginCustomer = async (identifier: string, password: string) => {
  const query = identifier.includes('@') ? { email: identifier.toLowerCase() } : { phone: normalizePhone(identifier) }
  const user = await UserModel.findOne({ ...query, role: 'customer' }).select(SESSION_FIELDS)
  if (!user?.passwordHash) {
    await verifyAgainstDummy(password)
    throw invalidLogin()
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw invalidLogin()
  if (user.status === 'blocked') throw suspended('This account has been suspended. Please contact support.')
  user.lastLoginAt = new Date()
  return user.save()
}

export const loginStaff = async (email: string, password: string) => {
  const user = await UserModel.findOne({ email, role: { $in: STAFF_ROLES } }).select(SESSION_FIELDS)
  if (!user?.passwordHash) {
    await verifyAgainstDummy(password)
    throw invalidLogin()
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw invalidLogin()
  if (user.status === 'blocked') throw suspended('This account has been deactivated.')
  user.lastLoginAt = new Date()
  return user.save()
}

// Changes the password and ends every other session; the caller re-issues the current one.
export const changePassword = async (userId: string, currentPassword: string, newPassword: string) => {
  const user = await UserModel.findById(userId).select(SESSION_FIELDS)
  if (!user) throw notFound('Account')
  if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'Your current password is incorrect', {
      code: 'VALIDATION_ERROR',
      errors: [{ field: 'currentPassword', message: 'Incorrect password' }],
    })
  }
  user.passwordHash = await hashPassword(newPassword)
  user.sessionVersion = (user.sessionVersion ?? 0) + 1
  return user.save()
}

export const getProfile = async (userId: string) => {
  const user = await UserModel.findById(userId)
  if (!user) throw notFound('Account')
  return user
}
