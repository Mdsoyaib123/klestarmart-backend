import type { Request, Response } from 'express'
import { conflict, notFound } from '@/lib/AppError'
import { created, ok } from '@/lib/respond'
import CategoryModel from '@/modules/category/category.model'
import ProductModel from '@/modules/product/product.model'

export const listPublic = async (req: Request, res: Response) => {
  ok(res, await CategoryModel.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }))
}

// Admin list, with how many products use each category.
export const listAdmin = async (req: Request, res: Response) => {
  const [categories, counts] = await Promise.all([
    CategoryModel.find().sort({ sortOrder: 1, name: 1 }),
    ProductModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
  ])
  const byCategory = new Map(counts.map((row) => [row._id, row.count]))
  ok(
    res,
    categories.map((category) => ({ ...category.toJSON(), productCount: byCategory.get(category.slug) ?? 0 })),
  )
}

export const create = async (req: Request, res: Response) => {
  created(res, await CategoryModel.create(req.body))
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
  ok(res, category)
}

export const remove = async (req: Request, res: Response) => {
  const category = await CategoryModel.findById(req.params.id)
  if (!category) throw notFound('Category')
  const inUse = await ProductModel.countDocuments({ category: category.slug })
  if (inUse > 0) {
    throw conflict(`This category still has ${inUse} product(s). Move or delete them first.`, { details: { productCount: inUse } })
  }
  await category.deleteOne()
  ok(res, null)
}
