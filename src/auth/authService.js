const { hashPassword, verifyPassword } = require("./passwordHashing");
const { createSessionToken } = require("./sessionToken");

const GENERIC_LOGIN_FAILURE = "Invalid username or password.";
const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function createUserWithPassword({ repository, user }) {
  const passwordResult = hashPassword(user?.password);

  if (!passwordResult.accepted) {
    return reject("invalid_user_password", "Password is invalid.");
  }

  return repository.createUser({
    ...user,
    passwordHash: passwordResult.passwordHash,
    passwordSalt: passwordResult.passwordSalt,
  });
}

function authenticateCredentials({
  repository,
  clinicId,
  username,
  password,
  now = new Date(),
  ttlMs = DEFAULT_SESSION_TTL_MS,
}) {
  const user = repository.findUserByUsername({ clinicId, username });

  if (
    !user ||
    user.active !== true ||
    !verifyPassword({
      password,
      passwordHash: user.passwordHash,
      passwordSalt: user.passwordSalt,
    })
  ) {
    return reject("invalid_credentials", GENERIC_LOGIN_FAILURE);
  }

  const token = createSessionToken();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const sessionResult = repository.createSession({
    clinicId: user.clinicId,
    userId: user.userId,
    tokenHash: token.tokenHash,
    expiresAt,
  });

  if (!sessionResult || sessionResult.status !== "ok") {
    return reject("session_creation_failed", "Session creation failed safely.");
  }

  return freezeClone({
    accepted: true,
    token: token.token,
    user: sanitizeUser(user),
    session: sessionResult.session,
  });
}

function resolveCurrentSession({ repository, token, now = new Date() }) {
  const session = repository.resolveSessionByToken(token);

  if (!session || session.revokedAt) {
    return reject("unauthorized", "Authentication is required.");
  }

  if (Number.isNaN(new Date(session.expiresAt).getTime())) {
    return reject("unauthorized", "Authentication is required.");
  }

  if (new Date(session.expiresAt).getTime() <= now.getTime()) {
    return reject("unauthorized", "Authentication is required.");
  }

  const user = repository.findUserById({
    clinicId: session.clinicId,
    userId: session.userId,
  });

  if (!user || user.active !== true) {
    return reject("unauthorized", "Authentication is required.");
  }

  return freezeClone({
    accepted: true,
    actor: {
      actorId: user.userId,
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      clinicId: user.clinicId,
      verified: true,
    },
    session: {
      expiresAt: session.expiresAt,
    },
  });
}

function revokeSession({ repository, token }) {
  repository.revokeSessionByToken(token);
  return freezeClone({
    accepted: true,
    revoked: true,
  });
}

function sanitizeUser(user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    clinicId: user.clinicId,
  };
}

function reject(code, reason) {
  return freezeClone({
    accepted: false,
    code,
    reason,
  });
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  DEFAULT_SESSION_TTL_MS,
  GENERIC_LOGIN_FAILURE,
  authenticateCredentials,
  createUserWithPassword,
  resolveCurrentSession,
  revokeSession,
};
