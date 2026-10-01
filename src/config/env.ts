import dotenv from 'dotenv'

dotenv.config()

export const env = {
  port: process.env.PORT ?? '5000',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/klestarmart',
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
}
