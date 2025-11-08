import mongoose from "mongoose";

const magicLinkSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Auto-delete expired links after 1 hour
magicLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export default mongoose.model("MagicLink", magicLinkSchema);

