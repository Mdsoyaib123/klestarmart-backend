import { Router } from 'express'
import { customerAuthRoutes, staffAuthRoutes } from '@/modules/auth/auth.routes'
import { adminBannerRoutes, publicBannerRoutes } from '@/modules/banner/banner.routes'
import { adminCategoryRoutes, publicCategoryRoutes } from '@/modules/category/category.routes'
import { accountOrderRoutes, adminOrderRoutes, publicOrderRoutes } from '@/modules/order/order.routes'
import { adminPaymentRoutes } from '@/modules/payment/payment.routes'
import { adminProductRoutes, publicProductRoutes } from '@/modules/product/product.routes'
import { adminSettingsRoutes, publicSettingsRoutes } from '@/modules/settings/settings.routes'
import { adminStatsRoutes } from '@/modules/stats/stats.routes'
import { adminUploadRoutes } from '@/modules/upload/upload.routes'
import { adminCustomerRoutes, adminStaffRoutes } from '@/modules/user/user.routes'

const router = Router()

// Storefront
router.use('/auth', customerAuthRoutes)
router.use('/account/orders', accountOrderRoutes)
router.use('/products', publicProductRoutes)
router.use('/categories', publicCategoryRoutes)
router.use('/banners', publicBannerRoutes)
router.use('/settings', publicSettingsRoutes)
router.use('/orders', publicOrderRoutes)

// Admin dashboard (every route below checks for a staff session)
const admin = Router()
admin.use('/auth', staffAuthRoutes)
admin.use('/stats', adminStatsRoutes)
admin.use('/products', adminProductRoutes)
admin.use('/categories', adminCategoryRoutes)
admin.use('/orders', adminOrderRoutes)
admin.use('/payments', adminPaymentRoutes)
admin.use('/customers', adminCustomerRoutes)
admin.use('/staff', adminStaffRoutes)
admin.use('/banners', adminBannerRoutes)
admin.use('/settings', adminSettingsRoutes)
admin.use('/uploads', adminUploadRoutes)
router.use('/admin', admin)

export default router
