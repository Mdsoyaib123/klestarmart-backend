import { Schema, model } from 'mongoose'

const counterSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } }, { versionKey: false })
const CounterModel = model('Counter', counterSchema)

// Atomically returns the next number in a named sequence (1, 2, 3, ...).
export const nextSequence = async (name: string) => {
  const counter = await CounterModel.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })
  return counter.seq
}
