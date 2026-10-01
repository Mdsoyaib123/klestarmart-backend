import ProductModel from '@/modules/product/product.model'
import type { Product } from '@/modules/product/product.model'

export const findAll = () => ProductModel.find()

export const findById = (id: string) => ProductModel.findById(id)

export const create = (payload: Partial<Product>) => ProductModel.create(payload)

export const updateById = (id: string, payload: Partial<Product>) =>
  ProductModel.findByIdAndUpdate(id, payload, { new: true, runValidators: true })

export const deleteById = (id: string) => ProductModel.findByIdAndDelete(id)
