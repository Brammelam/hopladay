import mongoose from "mongoose";

const suggestionSchema = new mongoose.Schema({
  startDate: Date,
  endDate: Date,
  vacationDaysUsed: Number,
  totalDaysOff: Number,
  description: String,
  reason: String,
  roi: String,
  efficiency: String,
  isManual: { type: Boolean, default: false },
  isMerged: { type: Boolean, default: false },
});

const manualDaySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  note: String,
});

const planSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Always required - single user ID
  year: { type: Number, required: true },
  countryCode: { type: String, default: "NO" },
  availableDays: Number,
  usedDays: Number,
  totalDaysOff: Number,
  suggestions: [suggestionSchema],
  manualDays: [manualDaySchema],
  isModifiedByUser: { type: Boolean, default: false },
  preference: { type: String, default: "balanced" },
}, { timestamps: true });

planSchema.index(
  { userId: 1, year: 1 }, 
  { 
    unique: true, 
    name: 'userId_year_unique'
  }
);

export default mongoose.model("HolidayPlan", planSchema);
