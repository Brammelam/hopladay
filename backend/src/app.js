import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import holidaysRouter from "./routes/holidays.js";
import usersRouter from "./routes/users.js";
import plansRouter from "./routes/plans.js";
import authRouter from "./routes/auth.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/holidays", holidaysRouter);
app.use("/api/users", usersRouter);
app.use("/api/plans", plansRouter);
app.use("/api/auth", authRouter);

app.get("/", (req, res) => res.send("Holiday Planner API is running"));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(process.env.PORT ?? 4000, () =>
      console.log(`Server running on port ${process.env.PORT ?? 4000}`)
    );
  })
  .catch((err) => console.error("MongoDB connection error:", err));
