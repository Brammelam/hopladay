import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema({
  date: { type: String, required: true }, // store as "YYYY-MM-DD"
  localName: String,
  name: String,
  countryCode: { type: String, required: true },
  year: { type: Number, required: true },
});

// Enforce unique per country/year/date combo
holidaySchema.index({ year: 1, countryCode: 1, date: 1 }, { unique: true });

export default mongoose.model("Holiday", holidaySchema);
