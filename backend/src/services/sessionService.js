import { createHash, randomBytes } from 'node:crypto';
import Session from '../models/Session.js';
import User from '../models/User.js';

const lifetime = 14 * 86400000;
const digest = token => createHash('sha256').update(token).digest('hex');

export function createSessionService({ sessions = Session, users = User, now = Date.now } = {}) {
  return {
    async issueSession(userId) {
      const token = randomBytes(32).toString('base64url');
      await sessions.create({ userId, tokenHash: digest(token), expiresAt: new Date(now() + lifetime) });
      return token;
    },
    async authenticateSession(req) {
      const header = req.headers?.authorization;
      if (typeof header !== 'string') return null;
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(header);
      if (!match) return null;
      const session = await sessions.findOne({ tokenHash: digest(match[1]) });
      if (!session || !(new Date(session.expiresAt).getTime() > now())) return null;
      return users.findById(session.userId);
    },
  };
}

export const { issueSession, authenticateSession } = createSessionService();

export function ownsAccount(user, actor) {
  return Boolean(user && actor && String(user._id) === String(actor._id));
}

export function encodeRegistrationChallenge(challenge, ownerId = null) {
  return `register:${ownerId ?? 'new'}:${challenge}`;
}

export function decodeRegistrationChallenge(value) {
  if (typeof value !== 'string') return null;
  const match = /^register:(new|[a-f0-9]{24}):([A-Za-z0-9_-]+)$/.exec(value);
  return match ? { ownerId: match[1] === 'new' ? null : match[1], challenge: match[2] } : null;
}

export function canCompleteRegistration(user, actor, state) {
  if (!user || !state) return false;
  if (state.ownerId !== null) return state.ownerId === String(user._id) && ownsAccount(user, actor);
  return ownsAccount(user, actor) || (user.isPremium !== true && !user.authenticators?.length);
}

// Explicit allowlist: never expose browser identifiers, challenges or credentials.
export function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    availableDays: user.availableDays,
    isPremium: user.isPremium === true,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
