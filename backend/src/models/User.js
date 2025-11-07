import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  availableDays: Number,
});

export default mongoose.model("User", userSchema);
