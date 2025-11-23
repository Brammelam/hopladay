import express from "express";
import Stripe from "stripe";
import User from "../models/User.js";
import emailService from "../services/emailService.js";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

// Initialize Stripe with secret key from environment
// Note: Secret key (sk_...) is for server-side use only
// Public key (pk_...) is for client-side use (if needed for Stripe.js)
let stripe = null;

// Lazy initialization of Stripe to handle missing key gracefully
function getStripe() {
  if (!stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured. Please set it in your .env file.");
    }
    stripe = new Stripe(secretKey, {
      apiVersion: "2024-12-18.acacia",
    });
  }
  return stripe;
}

// Validation function to be called after app initialization
export function validateStripeConfig() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("⚠️  STRIPE_SECRET_KEY is not set. Payment functionality will not work.");
    console.warn("   Add STRIPE_SECRET_KEY=sk_test_... to your .env file");
    return false;
  } else {
    console.log("✓ Stripe secret key configured");
    return true;
  }
}

/**
 * POST /api/payment/create-checkout-session
 * Create a Stripe Checkout session for premium upgrade
 * Body: { userId, successUrl?, cancelUrl? }
 */
router.post("/create-checkout-session", async (req, res) => {
  try {
    const stripeInstance = getStripe();
    const { userId, successUrl, cancelUrl } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.isPremium) {
      return res.status(400).json({ error: "User is already premium" });
    }

    // Get base URL from environment or request
    const baseUrl = process.env.FRONTEND_URL;
    const defaultSuccessUrl = `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${baseUrl}/payment/cancel`;

    // Create Stripe Checkout Session
    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "nok",
            product_data: {
              name: "Hopladay Premium",
              description: "Lifetime access to advanced planning strategies, unlimited suggestions, and export features",
              images: [], // Add product image URL if available
            },
            unit_amount: 4900, // 49.00 NOK in cents (one-time payment)
          },
          quantity: 1,
        },
      ],
      mode: "payment", // One-time payment, not subscription
      success_url: successUrl || defaultSuccessUrl,
      cancel_url: cancelUrl || defaultCancelUrl,
      client_reference_id: userId,
      metadata: {
        userId: userId.toString(),
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error("Error creating checkout session:", err);
    res.status(500).json({ error: "Failed to create checkout session", message: err.message });
  }
});

/**
 * POST /api/payment/webhook
 * Handle Stripe webhook events (payment confirmation)
 * This endpoint should be configured in Stripe Dashboard
 * Note: Raw body middleware is applied in app.js before express.json()
 */
export const webhookHandler = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return res.status(400).send("Webhook secret not configured");
  }

  let event;

  try {
    const stripeInstance = getStripe();
    event = stripeInstance.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed":
      const session = event.data.object;
      
      // Verify this is a one-time payment (not subscription)
      if (session.mode === "payment" && session.payment_status === "paid") {
        const userId = session.client_reference_id || session.metadata?.userId;
        
        if (userId) {
          try {
            const user = await User.findByIdAndUpdate(userId, { isPremium: true }, { new: true });
            if (user && user.email) {
              console.log(`User ${userId} upgraded to premium (one-time payment)`);
              // Send premium upgrade email
              emailService.sendPremiumUpgrade(user.email);
            }
          } catch (err) {
            console.error(`Failed to update user ${userId} to premium:`, err);
          }
        }
      }
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
};

router.post("/webhook", webhookHandler);

/**
 * GET /api/payment/check-session
 * Check if a checkout session was successful
 * Query: ?session_id=xxx
 */
router.get("/check-session", async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: "session_id is required" });
    }

    const stripeInstance = getStripe();
    const session = await stripeInstance.checkout.sessions.retrieve(session_id);

    console.log("Checking session:", {
      session_id,
      payment_status: session.payment_status,
      mode: session.mode,
      client_reference_id: session.client_reference_id,
      metadata: session.metadata
    });

    if (session.payment_status === "paid" && session.mode === "payment") {
      const userId = session.client_reference_id || session.metadata?.userId;
      
      if (userId) {
        // Update user to premium if payment was successful
        const user = await User.findByIdAndUpdate(
          userId,
          { isPremium: true },
          { new: true } // Return updated document
        );
        
        if (user) {
          console.log(`User ${userId} upgraded to premium via check-session (one-time payment)`);

          // Send premium upgrade email
          await emailService.sendPremiumUpgrade(user.email);

          return res.json({ success: true, premium: true, user });
        } else {
          console.error(`User ${userId} not found`);
          return res.status(404).json({ error: "User not found" });
        }
      } else {
        console.error("No userId found in session", session);
        return res.status(400).json({ error: "User ID not found in session" });
      }
    }

    // Payment not completed yet or not a one-time payment
    res.json({ 
      success: false, 
      premium: false,
      payment_status: session.payment_status,
      mode: session.mode
    });
  } catch (err) {
    console.error("Error checking session:", err);
    res.status(500).json({ error: "Failed to check session", message: err.message });
  }
});

export default router;

