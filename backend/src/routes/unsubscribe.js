import express from "express";
import crypto from "crypto";
import User from "../models/User.js";
import emailService from "../services/emailService.js";

const router = express.Router();

/**
 * Verify unsubscribe token
 */
function verifyUnsubscribeToken(email, token) {
  const expectedToken = emailService.generateUnsubscribeToken(email);
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(expectedToken)
  );
}

/**
 * GET /api/unsubscribe
 * Unsubscribe page - shows confirmation
 * Query: ?email=xxx&token=xxx
 */
router.get("/", async (req, res) => {
  try {
    const { email, token } = req.query;

    if (!email || !token) {
      return res.status(400).json({ 
        error: "Email and token are required",
        message: "Invalid unsubscribe link. Please contact support@hopladay.com if you need help."
      });
    }

    // Verify token
    if (!verifyUnsubscribeToken(email, token)) {
      return res.status(400).json({ 
        error: "Invalid token",
        message: "This unsubscribe link is invalid or has expired. Please contact support@hopladay.com if you need help."
      });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        error: "User not found",
        message: "No account found with this email address."
      });
    }

    // Return success - frontend will handle the actual unsubscribe
    res.json({ 
      success: true,
      email,
      message: "You can unsubscribe from emails below."
    });
  } catch (err) {
    console.error("Error in unsubscribe GET:", err);
    res.status(500).json({ 
      error: "Internal server error",
      message: "An error occurred. Please contact support@hopladay.com for assistance."
    });
  }
});

/**
 * POST /api/unsubscribe
 * Process unsubscribe request
 * Body: { email, token }
 */
router.post("/", async (req, res) => {
  try {
    const { email, token } = req.body;

    if (!email || !token) {
      return res.status(400).json({ 
        error: "Email and token are required" 
      });
    }

    // Verify token
    if (!verifyUnsubscribeToken(email, token)) {
      return res.status(400).json({ 
        error: "Invalid token",
        message: "This unsubscribe link is invalid or has expired."
      });
    }

    // Find user and mark as unsubscribed
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        error: "User not found" 
      });
    }

    // Add unsubscribed flag to user
    user.emailUnsubscribed = true;
    user.emailUnsubscribedAt = new Date();
    await user.save();

    console.log(`User ${email} unsubscribed from emails`);

    res.json({ 
      success: true,
      message: "You have been successfully unsubscribed from Hopladay emails. You will no longer receive emails from us."
    });
  } catch (err) {
    console.error("Error processing unsubscribe:", err);
    res.status(500).json({ 
      error: "Failed to process unsubscribe",
      message: "An error occurred. Please contact support@hopladay.com for assistance."
    });
  }
});

export default router;

