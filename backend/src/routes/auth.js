import express from "express";
import crypto from "crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import User from "../models/User.js";
import MagicLink from "../models/MagicLink.js";
import emailService from "../services/emailService.js";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

// Configuration
const rpName = "Hopladay";

const origin = process.env.FRONTEND_URL;
// Extract rpID from origin (domain only, no protocol or path)
// e.g., "https://hopladay.com" -> "hopladay.com"
const rpID = origin ? new URL(origin).hostname : 'localhost';


/**
 * GET /api/auth/config
 * Check auth configuration (for debugging)
 */
router.get("/config", (req, res) => {
  res.json({
    origin,
    emailConfigured: !!(process.env.EMAILUSER && process.env.EMAILPWD),
    passkeyEnabled: true,
    magicLinkEnabled: true,
  });
});

/**
 * POST /api/auth/register/start
 * Start passkey registration (for claiming anonymous plans)
 * Body: { email, browserId }
 */
router.post("/register/start", async (req, res) => {
  try {
    const { email, browserId } = req.body;

    if (!email || !browserId) {
      return res.status(400).json({ error: "email and browserId are required" });
    }

    // Check if email already exists
    let user = await User.findOne({ email });
    
    if (user && user.authenticators && user.authenticators.length > 0) {
      return res.status(400).json({ error: "This email already has a passkey. Please sign in instead." });
    }

    // Get or create user by browserId (to claim their anonymous plans)
    if (!user) {
      const anonUser = await User.findOne({ browserId });
      if (anonUser) {
        // Claim anonymous plans with email
        anonUser.email = email;
        anonUser.name = email.split('@')[0];
        user = anonUser;
      } else {
        // Create new user
        user = new User({
          email,
          name: email.split('@')[0],
          browserId,
        });
      }
    }

    // Generate registration options
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(user._id.toString()),
      userName: email,
      userDisplayName: email.split('@')[0],
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Save challenge
    user.currentChallenge = options.challenge;
    await user.save();

    res.json(options);
  } catch (err) {
    console.error(" Error starting registration:", err);
    res.status(500).json({ error: "Failed to start registration", message: err.message });
  }
});

/**
 * POST /api/auth/register/finish
 * Finish passkey registration
 * Body: { email, credential }
 */
router.post("/register/finish", async (req, res) => {
  try {
    const { email, credential } = req.body;

    if (!email || !credential) {
      return res.status(400).json({ error: "email and credential are required" });
    }

    const user = await User.findOne({ email });
    if (!user || !user.currentChallenge) {
      return res.status(400).json({ error: "No registration in progress" });
    }

    // Verify the credential
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: "Verification failed" });
    }

    const regInfo = verification.registrationInfo;


    // In SimpleWebAuthn v13+, credentials are in regInfo.credential
    const cred = regInfo.credential;
    
    if (!cred || !cred.id || !cred.publicKey) {
      console.error(' Missing credential data in registrationInfo');
      return res.status(500).json({ error: 'Invalid credential structure' });
    }


    // In v13, cred.id is a base64url string, publicKey is Uint8Array
    // Use SimpleWebAuthn's helper to ensure proper encoding
    const newAuthenticator = {
      credentialID: cred.id, // Already base64url string from SimpleWebAuthn
      credentialPublicKey: isoBase64URL.fromBuffer(cred.publicKey), // Convert to base64url using their helper
      counter: cred.counter || 0,
      credentialDeviceType: regInfo.credentialDeviceType,
      credentialBackedUp: regInfo.credentialBackedUp,
      transports: cred.transports || [],
    };


    // Check if this is a new user (no authenticators before this one)
    const isNewUser = user.authenticators.length === 0;
    
    user.authenticators.push(newAuthenticator);
    user.currentChallenge = undefined;
    await user.save();

    // Send passkey registration email
    emailService.sendPasskeyRegistered(user.email);
    
    // Send welcome email if this is a new user
    if (isNewUser) {
      emailService.sendWelcome(user.email, user.name);
    }

    res.json({
      verified: true,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        availableDays: user.availableDays,
      },
    });
  } catch (err) {
    console.error(" Error finishing registration:", err);
    res.status(500).json({ error: "Failed to finish registration", message: err.message });
  }
});

/**
 * POST /api/auth/login/start
 * Start passkey authentication
 * Body: { email }
 */
router.post("/login/start", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const user = await User.findOne({ email });
    
    if (!user || !user.authenticators || user.authenticators.length === 0) {
      return res.status(404).json({ error: "No passkey found for this email" });
    }


    // Generate authentication options
    // In v13, allowCredentials[].id should be a base64url STRING, not Uint8Array
    const allowCredentials = user.authenticators.map(auth => {
      // Convert to plain object to ensure we have clean data
      const authObj = auth.toObject ? auth.toObject() : auth;
      
      
      // credentialID is stored as base64url string, pass it directly
      const credentialIDString = String(authObj.credentialID);
      const transports = (authObj.transports || []).filter(t => typeof t === 'string');
      
      return {
        id: credentialIDString, // Pass as base64url string
        type: 'public-key',
        transports,
      };
    });


    // Generate authentication options with base64url string IDs
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred',
    });

    // Save challenge
    user.currentChallenge = options.challenge;
    await user.save();

    res.json(options);
  } catch (err) {
    console.error(" Error starting login:", err);
    res.status(500).json({ error: "Failed to start login", message: err.message });
  }
});

/**
 * POST /api/auth/login/finish
 * Finish passkey authentication
 * Body: { email, credential }
 */
router.post("/login/finish", async (req, res) => {
  try {
    const { email, credential } = req.body;

    if (!email || !credential) {
      return res.status(400).json({ error: "email and credential are required" });
    }


    const user = await User.findOne({ email });
    if (!user || !user.currentChallenge) {
      return res.status(400).json({ error: "No login in progress" });
    }

    // Find the authenticator - credential.id is already base64url string
    const credentialIDFromClient = credential.id; // Already base64url string from browser
    
    
    const authenticator = user.authenticators.find(auth => {
      const authObj = auth.toObject ? auth.toObject() : auth;
      const storedCredentialID = String(authObj.credentialID);
      return storedCredentialID === credentialIDFromClient;
    });

    if (!authenticator) {
      console.error(' Authenticator not found. Looking for:', credentialIDFromClient);
      console.error('Available:', user.authenticators.map(a => String(a.credentialID)));
      return res.status(400).json({ error: "Authenticator not found" });
    }
    
    // Convert to plain object for processing
    const authObj = authenticator.toObject ? authenticator.toObject() : authenticator;


    // In v13: Use SimpleWebAuthn's helper to decode base64url strings
    const credentialIDUint8 = isoBase64URL.toBuffer(String(authObj.credentialID));
    const publicKeyUint8 = isoBase64URL.toBuffer(String(authObj.credentialPublicKey));


    // Verify the credential
    let verification;
    try {
      
      // Verify using SimpleWebAuthn v13 API
      // NOTE: The parameter is called "credential" not "authenticator" in v13!
      verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: user.currentChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
        credential: {
          id: credentialIDUint8,
          publicKey: publicKeyUint8,
          counter: authObj.counter || 0,
        },
      });
      
    } catch (err) {
      console.error(' verifyAuthenticationResponse error:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack?.split('\n').slice(0, 5),
      });
      throw err;
    }

    if (!verification.verified) {
      return res.status(400).json({ error: "Verification failed" });
    }

    // Update counter in the actual authenticator object
    const authIndex = user.authenticators.findIndex(auth => {
      const authObj = auth.toObject ? auth.toObject() : auth;
      return String(authObj.credentialID) === String(credentialIDFromClient);
    });
    
    if (authIndex !== -1 && verification.authenticationInfo?.newCounter !== undefined) {
      user.authenticators[authIndex].counter = verification.authenticationInfo.newCounter;
    }
    
    user.currentChallenge = undefined;
    await user.save();

    res.json({
      verified: true,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        availableDays: user.availableDays,
        browserId: user.browserId,
      },
    });
  } catch (err) {
    console.error(" Error finishing login:", err);
    res.status(500).json({ error: "Failed to finish login", message: err.message });
  }
});

/**
 * POST /api/auth/magic-link/send
 * Request a magic link for email authentication
 * Body: { email }
 */
router.post("/magic-link/send", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Check if user exists - if not, we'll create them on verification
    const existingUser = await User.findOne({ email });
    const userId = existingUser ? existingUser._id : null;

    // Save magic link (userId will be set on verification if user doesn't exist)
    const magicLink = new MagicLink({
      email,
      token,
      expiresAt,
      userId,
    });
    await magicLink.save();

    // Generate magic link URL
    const magicUrl = `${origin}/en/auth/verify?token=${token}`;

    // Send magic link email in background (non-blocking)
    emailService.sendMagicLink(email, magicUrl);

    // Send immediate response
    res.json({
      success: true,
      message: "Magic link sent to your email",
      expiresIn: '15 minutes'
    });
  } catch (err) {
    console.error(" Error sending magic link:", err);
    res.status(500).json({ error: "Failed to send magic link", message: err.message });
  }
});

/**
 * POST /api/auth/magic-link/verify
 * Verify a magic link token and log user in
 * Body: { token, browserId? }
 */
router.post("/magic-link/verify", async (req, res) => {
  try {
    const { token, browserId } = req.body;

    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }

    // Find the magic link
    const now = new Date();
    const magicLink = await MagicLink.findOne({ token });

    if (!magicLink) {
      return res.status(400).json({ error: "Invalid magic link" });
    }

    if (magicLink.used) {
      return res.status(400).json({ error: "This magic link has already been used" });
    }

    if (magicLink.expiresAt < now) {
      return res.status(400).json({ error: "Magic link has expired" });
    }

    // Find or create user by email
    let user = await User.findOne({ email: magicLink.email });
    
    if (!user) {
      // Create new user
      user = new User({
        email: magicLink.email,
        name: magicLink.email.split('@')[0],
        availableDays: 25,
        browserId: browserId || undefined,
      });
      await user.save();
      
      // Send welcome email
      emailService.sendWelcome(user.email, user.name);
    } else if (browserId && browserId !== user.browserId) {
      // Update browserId if provided
      user.browserId = browserId;
      await user.save();
    }

    // Migrate anonymous plans (if browserId provided and user has plans)
    if (browserId) {
      const HolidayPlan = (await import('../models/HolidayPlan.js')).default;
      const plansToMigrate = await HolidayPlan.find({ 
        browserId: browserId, 
        userId: { $exists: false } 
      });
      
      if (plansToMigrate.length > 0) {
        for (const plan of plansToMigrate) {
          // Check if user already has a plan for this year
          const existingPlan = await HolidayPlan.findOne({ userId: user._id, year: plan.year });
          
          if (existingPlan) {
            // User already has a plan for this year - delete the anonymous one
            await plan.deleteOne();
          } else {
            // Migrate the plan to userId
            plan.userId = user._id;
            plan.browserId = undefined;
            await plan.save();
          }
        }
      }
    }

    // Mark link as used
    magicLink.used = true;
    magicLink.userId = user._id; // Update userId in case it was null
    await magicLink.save();

    // Return user
    res.json({
      verified: true,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        availableDays: user.availableDays,
        browserId: user.browserId,
        isPremium: user.isPremium || false,
      },
    });
  } catch (err) {
    console.error(" Error verifying magic link:", err);
    res.status(500).json({ error: "Failed to verify magic link", message: err.message });
  }
});

export default router;

