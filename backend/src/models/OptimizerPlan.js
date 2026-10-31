import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  version: { type: Number, default: 2, enum: [2], required: true },
  title: { type: String, maxlength: 120, default: '' },
  input: { type: mongoose.Schema.Types.Mixed, required: true },
  result: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });
export default mongoose.model('OptimizerPlan', schema);
