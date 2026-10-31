# Sessions for the version 2 optimizer

The existing successful passkey-registration, passkey-login and magic-link-verification responses now include an opaque `sessionToken`. Existing response fields remain unchanged. The new version 2 routes authenticate `Authorization: Bearer <sessionToken>`; they must not accept a public `userId` as proof of identity or Premium access.

`backend/src/services/sessionService.js` exports `issueSession(userId)` and `authenticateSession(req)`. Authentication returns the current database user, or `null` for an absent, invalid or expired token. Database failures throw and must fail closed. Premium checks must read `user.isPremium === true` from this result on every request.

Tokens contain 32 random bytes. Only a SHA-256 digest is stored in the new `Session` MongoDB collection. A TTL index removes expired sessions, and authentication checks expiration directly because Mongo cleanup is asynchronous. The lifetime is 14 days. No signing secret, additional dependency or new environment variable is required. Auth responses containing tokens use `Cache-Control: no-store`.

`AuthService` persists verified tokens through the existing browser platform service and exposes `getSessionToken()` / `clearSessionToken()`. Browser storage being disabled does not break login: the token can remain in memory for the tab. Logout must call `clearSessionToken()`; clearing browser state is not server-side revocation. Existing logged-in users without a token can continue using legacy routes, but must sign in again to access authenticated version 2 features.

An existing email account cannot acquire a new passkey without its verified owner session. Unauthenticated users receive 403 directing them to verify a magic link. Registration start and finish send the bearer token. A new email can still register a first passkey. Registration challenges are explicitly tagged with the ceremony and, for existing accounts, the owner ID; a login challenge cannot be used as a registration challenge. Completion checks ownership again, atomically consumes the challenge and checks that an anonymously started account has not acquired another passkey or paid entitlement in the meantime. This closes the previous existing-email passkey takeover path without changing valid first-time registration.

Auth boundaries reject non-string email, browser ID and magic-link-token values before building database queries. Full WebAuthn hardware, email delivery, Mongo index creation and production deployment still require integration verification.
