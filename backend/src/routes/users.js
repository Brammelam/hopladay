import express from 'express';
import { randomUUID } from 'node:crypto';
import User from '../models/User.js';
import { authenticateSession, issueSession, publicUser } from '../services/sessionService.js';

const router = express.Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// A browser ID or email is not proof of account ownership. Existing accounts
// must authenticate through the passkey or magic-link flow.
async function initialize(req, res) {
  try {
    const user = await authenticateSession(req);
    if (req.headers.authorization && !user) return res.status(401).json({ error: 'Authentication required' });
    const { email } = req.body ?? {};
    if (email && !user) return res.status(401).json({ error: 'Verify your email to sign in' });
    if (email && email !== user.email) return res.status(403).json({ error: 'Account does not match session' });
    if (user) return res.json(publicUser(user));

    const anonymous = new User({ browserId: randomUUID(), name: 'Anonymous', availableDays: 25 });
    await anonymous.save();
    res.json({ ...publicUser(anonymous), sessionToken: await issueSession(anonymous._id) });
  } catch {
    res.status(503).json({ error: 'Failed to initialize user' });
  }
}
router.post('/init', initialize);
router.post('/', initialize);
router.post('/claim', (_req, res) => res.status(410).json({ error: 'Use verified passkey or magic-link authentication to claim an account' }));
router.get('/:id', async (req, res) => {
  try {
    const user = await authenticateSession(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (String(user._id) !== req.params.id) return res.status(404).json({ error: 'User not found' });
    res.json(publicUser(user));
  } catch {
    res.status(503).json({ error: 'Failed to fetch user' });
  }
});
export default router;
