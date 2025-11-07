import mongoose from "mongoose";

const suggestionSchema = new mongoose.Schema({
  startDate: Date,
  endDate: Date,
  vacationDaysUsed: Number,
  totalDaysOff: Number,
  description: String,
});

const planSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  year: Number,
  availableDays: Number,
  usedDays: Number,
  totalDaysOff: Number,
  suggestions: [suggestionSchema],
});

export default mongoose.model("HolidayPlan", planSchema);
