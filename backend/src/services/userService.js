import User from "../models/User.js";

/**
 * Find or create a user by browserId
 * @param {string} browserId - UUID from browser localStorage
 * @param {object} defaults - Default values for new user
 * @returns {Promise<User>}
 */
export async function findOrCreateUserByBrowserId(browserId, defaults = {}) {
  if (!browserId) {
    throw new Error('browserId is required');
  }

  let user = await User.findOne({ browserId });
  
  if (!user) {
    user = new User({
      browserId,
      name: defaults.name || 'Anonymous',
      availableDays: defaults.availableDays || 25,
    });
    await user.save();
    console.log(`✨ Created new user with browserId: ${browserId}`);
  }

  return user;
}

/**
 * Find user by email or create new one
 * @param {string} email
 * @param {object} defaults
 * @returns {Promise<User>}
 */
export async function findOrCreateUserByEmail(email, defaults = {}) {
  if (!email) {
    throw new Error('email is required');
  }

  let user = await User.findOne({ email });
  
  if (!user) {
    user = new User({
      email,
      name: defaults.name || email.split('@')[0],
      availableDays: defaults.availableDays || 25,
    });
    await user.save();
    console.log(`✨ Created new user with email: ${email}`);
  }

  return user;
}

/**
 * Link a browserId to an existing email account (claim plans)
 * @param {string} browserId
 * @param {string} email
 * @returns {Promise<User>}
 */
export async function claimPlansWithEmail(browserId, email) {
  // Find the anonymous user
  const anonUser = await User.findOne({ browserId });
  
  if (!anonUser) {
    throw new Error('No user found with that browserId');
  }

  // Check if email already exists
  const existingEmailUser = await User.findOne({ email });
  
  if (existingEmailUser) {
    // Merge: Update all plans from anonUser to existingEmailUser
    const HolidayPlan = (await import('../models/HolidayPlan.js')).default;
    await HolidayPlan.updateMany(
      { userId: anonUser._id },
      { userId: existingEmailUser._id }
    );
    
    // Delete the anonymous user
    await User.deleteOne({ _id: anonUser._id });
    
    console.log(`🔗 Merged anonymous user ${browserId} into existing account ${email}`);
    return existingEmailUser;
  } else {
    // Just add email to the anonymous user
    anonUser.email = email;
    anonUser.name = email.split('@')[0];
    await anonUser.save();
    
    console.log(`🔗 Claimed plans for ${email}`);
    return anonUser;
  }
}

