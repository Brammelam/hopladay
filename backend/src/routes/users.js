import express from "express";
import User from "../models/User.js";

const router = express.Router();

/**
 * POST /api/users
 * Create or update a user
 */
router.post("/", async (req, res) => {
  try {
    const { name, email, availableDays } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Upsert user (create if not exists, otherwise update)
    const user = await User.findOneAndUpdate(
      { email },
      { name, availableDays },
      { new: true, upsert: true }
    );

    res.status(200).json(user);
  } catch (err) {
    console.error("❌ Error creating/updating user:", err);
    res.status(500).json({ error: "Failed to create or update user" });
  }
});

/**
 * GET /api/users/:id
 * Get user by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;
