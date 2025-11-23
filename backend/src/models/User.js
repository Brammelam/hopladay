import mongoose from "mongoose";

const authenticatorSchema = new mongoose.Schema({
  credentialID: { type: String, required: true }, // Base64 encoded string
  credentialPublicKey: { type: String, required: true }, // Base64 encoded string
  counter: { type: Number, required: true, default: 0 },
  credentialDeviceType: { type: String },
  credentialBackedUp: { type: Boolean },
  transports: { type: [String], default: [] },
}, { _id: false, strict: true });

const userSchema = new mongoose.Schema({
  name: { type: String, default: 'Anonymous' },
  email: { type: String, sparse: true, unique: true }, // Optional, unique when provided
  browserId: { type: String, sparse: true, index: true }, // UUID from browser localStorage
  availableDays: { type: Number, default: 25 },
  isPremium: { type: Boolean, default: false }, // Premium tier flag
  
  // WebAuthn / Passkey fields
  authenticators: [authenticatorSchema], // User can have multiple passkeys
  currentChallenge: { type: String }, // Temporary challenge for authentication
  
  // Email preferences
  emailUnsubscribed: { type: Boolean, default: false },
  emailUnsubscribedAt: { type: Date },
  
}, { timestamps: true });

export default mongoose.model("User", userSchema);
