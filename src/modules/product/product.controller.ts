import type { Request, Response, NextFunction } from 'express'
import * as productService from '@/modules/product/product.service'

export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await productService.findAll()
    res.status(200).json({ success: true, data: products })
  } catch (error) {
    next(error)
  }
}

export const getProductById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await productService.findById(String(req.params.id))
    if (!product) {
      res.status(404)
      throw new Error('Product not found')
    }
    res.status(200).json({ success: true, data: product })
  } catch (error) {
    next(error)
  }
}

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await productService.create(req.body)
    res.status(201).json({ success: true, data: product })
  } catch (error) {
    next(error)
  }
}

export const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await productService.updateById(String(req.params.id), req.body)
    if (!product) {
      res.status(404)
      throw new Error('Product not found')
    }
    res.status(200).json({ success: true, data: product })
  } catch (error) {
    next(error)
  }
}

export const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await productService.deleteById(String(req.params.id))
    if (!product) {
      res.status(404)
      throw new Error('Product not found')
    }
    res.status(200).json({ success: true, data: {} })
  } catch (error) {
    next(error)
  }
}
