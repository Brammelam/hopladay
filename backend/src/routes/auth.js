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
import { findOrCreateUserByBrowserId, findOrCreateUserByEmail } from "../services/userService.js";
import nodemailer from 'nodemailer';

const router = express.Router();

// Configuration
const rpName = "Hopladay";
const rpID = process.env.RP_ID || "localhost";
const origin = process.env.ORIGIN || `http://localhost:4200`;

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
    console.error("❌ Error starting registration:", err);
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

    // Log the structure to understand v13 format
    console.log('📝 Full verification object structure:', {
      verified: verification.verified,
      registrationInfoKeys: Object.keys(regInfo),
      hasCredential: !!regInfo.credential,
      credentialKeys: regInfo.credential ? Object.keys(regInfo.credential) : 'N/A',
    });

    // In SimpleWebAuthn v13+, credentials are in regInfo.credential
    const cred = regInfo.credential;
    
    if (!cred || !cred.id || !cred.publicKey) {
      console.error('❌ Missing credential data in registrationInfo');
      return res.status(500).json({ error: 'Invalid credential structure' });
    }

    console.log('📝 Credential details:', {
      idType: typeof cred.id,
      idConstructor: cred.id?.constructor?.name,
      idIsUint8Array: cred.id instanceof Uint8Array,
      idLength: cred.id?.length || 'unknown',
      publicKeyType: typeof cred.publicKey,
      publicKeyConstructor: cred.publicKey?.constructor?.name,
      publicKeyLength: cred.publicKey?.length || 'unknown',
      counter: cred.counter,
      transports: cred.transports,
    });

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

    console.log('📝 Saving authenticator:', {
      credentialIDType: typeof newAuthenticator.credentialID,
      credentialIDLength: newAuthenticator.credentialID.length,
      credentialID: newAuthenticator.credentialID,
      publicKeyLength: newAuthenticator.credentialPublicKey.length,
      counter: newAuthenticator.counter,
      transports: newAuthenticator.transports,
    });

    user.authenticators.push(newAuthenticator);

    user.currentChallenge = undefined;
    await user.save();

    console.log(`✅ Passkey registered for ${email}`);

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
    console.error("❌ Error finishing registration:", err);
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

    console.log('🔍 Found user with authenticators:', {
      authenticatorCount: user.authenticators.length,
      firstAuthType: typeof user.authenticators[0]?.credentialID,
      firstAuthSample: user.authenticators[0]?.credentialID?.substring?.(0, 50),
      firstAuthFullLength: user.authenticators[0]?.credentialID?.length,
    });

    // Generate authentication options
    // In v13, allowCredentials[].id should be a base64url STRING, not Uint8Array
    const allowCredentials = user.authenticators.map(auth => {
      // Convert to plain object to ensure we have clean data
      const authObj = auth.toObject ? auth.toObject() : auth;
      
      console.log('🔑 Raw authenticator from DB:', {
        credentialID: authObj.credentialID,
        credentialIDType: typeof authObj.credentialID,
        credentialIDLength: authObj.credentialID?.length,
      });
      
      // credentialID is stored as base64url string, pass it directly
      const credentialIDString = String(authObj.credentialID);
      const transports = (authObj.transports || []).filter(t => typeof t === 'string');
      
      return {
        id: credentialIDString, // Pass as base64url string
        type: 'public-key',
        transports,
      };
    });

    console.log('🎯 Generated allowCredentials:', {
      count: allowCredentials.length,
      firstId: allowCredentials[0]?.id,
      firstIdType: typeof allowCredentials[0]?.id,
      firstIdLength: allowCredentials[0]?.id?.length,
      firstTransports: allowCredentials[0]?.transports,
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
    console.error("❌ Error starting login:", err);
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

    console.log('📥 Login finish received:', {
      email,
      credentialKeys: credential ? Object.keys(credential) : 'N/A',
      credentialId: credential?.id,
      credentialType: credential?.type,
      hasResponse: !!credential?.response,
      responseKeys: credential?.response ? Object.keys(credential.response) : 'N/A',
      authenticatorDataType: typeof credential?.response?.authenticatorData,
      clientDataJSONType: typeof credential?.response?.clientDataJSON,
      signatureType: typeof credential?.response?.signature,
    });

    const user = await User.findOne({ email });
    if (!user || !user.currentChallenge) {
      return res.status(400).json({ error: "No login in progress" });
    }

    // Find the authenticator - credential.id is already base64url string
    const credentialIDFromClient = credential.id; // Already base64url string from browser
    
    console.log('🔍 Looking for authenticator:', {
      clientCredentialID: credentialIDFromClient,
      clientIDType: typeof credentialIDFromClient,
      clientIDLength: credentialIDFromClient?.length,
      storedIDs: user.authenticators.map(a => String(a.credentialID)),
    });
    
    const authenticator = user.authenticators.find(auth => {
      const authObj = auth.toObject ? auth.toObject() : auth;
      const storedCredentialID = String(authObj.credentialID);
      return storedCredentialID === credentialIDFromClient;
    });

    if (!authenticator) {
      console.error('❌ Authenticator not found. Looking for:', credentialIDFromClient);
      console.error('Available:', user.authenticators.map(a => String(a.credentialID)));
      return res.status(400).json({ error: "Authenticator not found" });
    }
    
    // Convert to plain object for processing
    const authObj = authenticator.toObject ? authenticator.toObject() : authenticator;

    console.log('🔐 Preparing verification with authenticator:', {
      credentialIDLength: String(authObj.credentialID).length,
      publicKeyLength: String(authObj.credentialPublicKey).length,
      counter: authObj.counter,
    });

    // In v13: Use SimpleWebAuthn's helper to decode base64url strings
    const credentialIDUint8 = isoBase64URL.toBuffer(String(authObj.credentialID));
    const publicKeyUint8 = isoBase64URL.toBuffer(String(authObj.credentialPublicKey));

    console.log('🔐 Calling verifyAuthenticationResponse with:', {
      hasResponse: !!credential,
      hasChallenge: !!user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticatorCredentialID: String(authObj.credentialID),
      authenticatorCounter: authObj.counter,
      credentialIDUint8Length: credentialIDUint8.length,
      publicKeyLength: publicKeyUint8.length,
    });

    // Verify the credential
    let verification;
    try {
      console.log('🔐 Credential object for verification:', {
        credentialIDType: credentialIDUint8?.constructor?.name,
        credentialIDLength: credentialIDUint8?.length,
        publicKeyType: publicKeyUint8?.constructor?.name,
        publicKeyLength: publicKeyUint8?.length,
        counter: authObj.counter,
      });
      
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
      
      console.log('✅ Verification result:', {
        verified: verification.verified,
        hasAuthInfo: !!verification.authenticationInfo,
        authInfoKeys: verification.authenticationInfo ? Object.keys(verification.authenticationInfo) : 'N/A',
      });
    } catch (err) {
      console.error('❌ verifyAuthenticationResponse error:', err);
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
      console.log(`✅ Updated counter to ${verification.authenticationInfo.newCounter} for authenticator ${authIndex}`);
    } else {
      console.warn('⚠️ Could not update counter:', { authIndex, hasNewCounter: !!verification.authenticationInfo?.newCounter });
    }
    
    user.currentChallenge = undefined;
    await user.save();

    console.log(`✅ User logged in: ${email}`);

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
    console.error("❌ Error finishing login:", err);
    res.status(500).json({ error: "Failed to finish login", message: err.message });
  }
});

/**
 * POST /api/auth/magic-link/send
 * Request a magic link for email authentication
 * Body: { email, browserId? }
 */
router.post("/magic-link/send", async (req, res) => {
  try {
    const { email, browserId } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    // Find or create user
    let user = await User.findOne({ email });
    
    if (!user && browserId) {
      // Claim anonymous plans if user doesn't exist
      const anonUser = await User.findOne({ browserId });
      if (anonUser) {
        anonUser.email = email;
        anonUser.name = email.split('@')[0];
        user = anonUser;
        await user.save();
      }
    }
    
    if (!user) {
      // Create new user
      user = await findOrCreateUserByEmail(email, { name: email.split('@')[0] });
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save magic link
    const magicLink = new MagicLink({
      email,
      token,
      expiresAt,
      userId: user._id,
    });
    await magicLink.save();

    // In production, send email here
    // For now, return the link in response (DEV ONLY)
    const magicUrl = `${origin}/auth/verify?token=${token}`;
    
    console.log(`📧 Magic link generated for ${email}: ${magicUrl}`);

    const transporter = nodemailer.createTransport({ 
      service: 'gmail',
      auth: {
        user: process.env.EMAILUSER,
        pass: process.env.EMAILPWD
      },
    });
    await transporter.sendMail({
      to: email,
      subject: 'Sign in to Hopladay',
      html: `Click here to sign in: <a href="${magicUrl}">${magicUrl}</a>`
    });

    res.json({
      success: true,
      message: "Magic link sent to your email",
      expiresIn: '15 minutes',
    });
  } catch (err) {
    console.error("❌ Error sending magic link:", err);
    res.status(500).json({ error: "Failed to send magic link", message: err.message });
  }
});

/**
 * POST /api/auth/magic-link/verify
 * Verify a magic link token
 * Body: { token }
 */
router.post("/magic-link/verify", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }

    // Find the magic link
    const magicLink = await MagicLink.findOne({ 
      token,
      used: false,
      expiresAt: { $gt: new Date() }
    });

    if (!magicLink) {
      return res.status(400).json({ error: "Invalid or expired magic link" });
    }

    // Get the user
    const user = await User.findById(magicLink.userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Mark link as used
    magicLink.used = true;
    await magicLink.save();

    console.log(`✅ Magic link verified for ${user.email}`);

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
    console.error("❌ Error verifying magic link:", err);
    res.status(500).json({ error: "Failed to verify magic link", message: err.message });
  }
});

export default router;

