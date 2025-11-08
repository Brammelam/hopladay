import express from "express";
import User from "../models/User.js";
import { findOrCreateUserByBrowserId, findOrCreateUserByEmail, claimPlansWithEmail } from "../services/userService.js";

const router = express.Router();

/**
 * POST /api/users/init
 * Initialize user session (by browserId or email)
 * Body: { browserId?, email?, name?, availableDays? }
 */
router.post("/init", async (req, res) => {
  try {
    const { browserId, email, name, availableDays } = req.body;

    let user;

    if (email) {
      // Find or create by email
      user = await findOrCreateUserByEmail(email, { name, availableDays });
    } else if (browserId) {
      // Find or create by browserId
      user = await findOrCreateUserByBrowserId(browserId, { name, availableDays });
    } else {
      return res.status(400).json({ error: "browserId or email is required" });
    }

    res.json(user);
  } catch (err) {
    console.error("❌ Error initializing user:", err);
    res.status(500).json({ error: "Failed to initialize user", message: err.message });
  }
});

/**
 * POST /api/users/claim
 * Claim anonymous plans with email
 * Body: { browserId, email }
 */
router.post("/claim", async (req, res) => {
  try {
    const { browserId, email } = req.body;

    if (!browserId || !email) {
      return res.status(400).json({ error: "browserId and email are required" });
    }

    const user = await claimPlansWithEmail(browserId, email);
    res.json(user);
  } catch (err) {
    console.error("❌ Error claiming plans:", err);
    res.status(500).json({ error: "Failed to claim plans", message: err.message });
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

// Legacy endpoint for backwards compatibility
router.post("/", async (req, res) => {
  try {
    const { name, email, availableDays, browserId } = req.body;
    
    let user;
    if (email) {
      user = await findOrCreateUserByEmail(email, { name, availableDays });
    } else if (browserId) {
      user = await findOrCreateUserByBrowserId(browserId, { name, availableDays });
    } else {
      return res.status(400).json({ error: "email or browserId is required" });
    }

    res.json(user);
  } catch (err) {
    console.error("❌ Error creating user:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

export default router;
