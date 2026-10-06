import type { Request, Response } from 'express'
import { AppError, notFound } from '@/lib/AppError'
import CategoryModel from '@/modules/category/category.model'
import ProductModel from '@/modules/product/product.model'

export const listPublic = async (req: Request, res: Response) => {
  const categories = await CategoryModel.find({ isActive: true }).sort({ sortOrder: 1, name: 1 })
  res.json({ success: true, data: categories })
}

// Admin list, with how many products use each category.
export const listAdmin = async (req: Request, res: Response) => {
  const [categories, counts] = await Promise.all([
    CategoryModel.find().sort({ sortOrder: 1, name: 1 }),
    ProductModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
  ])
  const byCategory = new Map(counts.map((row) => [row._id, row.count]))
  res.json({
    success: true,
    data: categories.map((category) => ({ ...category.toJSON(), productCount: byCategory.get(category.slug) ?? 0 })),
  })
}

export const create = async (req: Request, res: Response) => {
  const category = await CategoryModel.create(req.body)
  res.status(201).json({ success: true, data: category })
}

export const update = async (req: Request, res: Response) => {
  const category = await CategoryModel.findById(req.params.id)
  if (!category) throw notFound('Category')
  const previousSlug = category.slug
  category.set(req.body)
  await category.save()
  // Products reference categories by slug, so a renamed slug carries its products along.
  if (previousSlug !== category.slug) {
    await ProductModel.updateMany({ category: previousSlug }, { category: category.slug })
  }
  res.json({ success: true, data: category })
}

export const remove = async (req: Request, res: Response) => {
  const category = await CategoryModel.findById(req.params.id)
  if (!category) throw notFound('Category')
  const inUse = await ProductModel.countDocuments({ category: category.slug })
  if (inUse > 0) throw new AppError(409, `This category still has ${inUse} product(s). Move or delete them first.`)
  await category.deleteOne()
  res.json({ success: true, data: {} })
}
