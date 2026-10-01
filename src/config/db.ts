import mongoose from 'mongoose'
import { env } from '@/config/env'

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(env.mongodbUri)
    console.log('MongoDB connected')
  } catch (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }
}
