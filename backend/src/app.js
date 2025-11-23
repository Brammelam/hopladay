// Load environment variables FIRST, before any imports that might use them
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import cors from "cors";

import holidaysRouter from "./routes/holidays.js";
import usersRouter from "./routes/users.js";
import plansRouter from "./routes/plans.js";
import authRouter from "./routes/auth.js";
import paymentRouter, { webhookHandler, validateStripeConfig } from "./routes/payment.js";
import unsubscribeRouter from "./routes/unsubscribe.js";
import emailService from "./services/emailService.js";

// Validate Stripe configuration after all imports are done
validateStripeConfig();

// Initialize email service to check configuration
emailService.ensureInitialized();

const app = express();
app.use(cors());

// Stripe webhook needs raw body, so register it before json middleware
app.post("/api/payment/webhook", express.raw({ type: "application/json" }), webhookHandler);

// JSON middleware for all other routes
app.use(express.json());

// Routes
app.use("/api/holidays", holidaysRouter);
app.use("/api/users", usersRouter);
app.use("/api/plans", plansRouter);
app.use("/api/auth", authRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/unsubscribe", unsubscribeRouter);

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
