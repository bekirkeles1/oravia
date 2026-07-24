const { randomBytes } = require("node:crypto");

const { isValidRole } = require("./authRoles");
const { hashSessionToken } = require("./sessionToken");
const { cloneValue, freezeClone } = require("../persistence/sqliteJson");

function createInMemoryAuthRepository({ clinicId = "oravia_demo_clinic" } = {}) {
  const users = new Map();
  const sessionsByHash = new Map();
  const safeClinicId = normalizeClinicId(clinicId);

  return Object.freeze({
    storage: "in_memory",
    durablePersistence: false,
    databasePersisted: false,
    createUser(input) {
      const validation = validateUserInput(input, safeClinicId);

      if (!validation.ok) {
        return reject(validation.error);
      }

      const duplicate = Array.from(users.values()).find(
        (user) =>
          user.clinicId === validation.user.clinicId &&
          user.username === validation.user.username
      );

      if (duplicate) {
        return reject({
          code: "auth_user_already_exists",
          message: "User identity already exists for this clinic.",
        });
      }

      const user = {
        ...validation.user,
        userId: validation.user.userId || buildUserId(validation.user.username),
        active: validation.user.active !== false,
      };

      users.set(`${user.clinicId}:${user.userId}`, cloneValue(user));
      return okUser(user);
    },
    findUserByUsername({ clinicId: requestedClinicId, username }) {
      const lookupClinicId = normalizeClinicId(requestedClinicId);
      const lookupUsername = normalizeUsername(username);
      const user = Array.from(users.values()).find(
        (item) =>
          item.clinicId === lookupClinicId && item.username === lookupUsername
      );
      return user ? freezeClone(user) : null;
    },
    findUserById({ clinicId: requestedClinicId, userId }) {
      const key = `${normalizeClinicId(requestedClinicId)}:${normalizeText(userId)}`;
      const user = users.get(key);
      return user ? freezeClone(user) : null;
    },
    createSession(input) {
      const validation = validateSessionInput(input, safeClinicId);

      if (!validation.ok) {
        return reject(validation.error);
      }

      sessionsByHash.set(validation.session.tokenHash, cloneValue(validation.session));
      return freezeClone({
        status: "ok",
        session: sanitizeSession(validation.session),
      });
    },
    resolveSessionByToken(token) {
      const tokenHash = hashSessionToken(token);

      if (!tokenHash) {
        return null;
      }

      const session = sessionsByHash.get(tokenHash);
      return session ? freezeClone(session) : null;
    },
    revokeSessionByToken(token) {
      const tokenHash = hashSessionToken(token);
      const session = tokenHash ? sessionsByHash.get(tokenHash) : null;

      if (!session) {
        return false;
      }

      sessionsByHash.set(tokenHash, {
        ...session,
        revokedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return true;
    },
  });
}

function createSqliteAuthRepository({ persistenceProvider }) {
  const database = persistenceProvider.getDatabase();
  const clinicId = persistenceProvider.getClinicId();

  return Object.freeze({
    storage: "sqlite",
    durablePersistence: true,
    databasePersisted: true,
    createUser(input) {
      const validation = validateUserInput(input, clinicId);

      if (!validation.ok) {
        return reject(validation.error);
      }

      if (this.findUserByUsername({ clinicId, username: validation.user.username })) {
        return reject({
          code: "auth_user_already_exists",
          message: "User identity already exists for this clinic.",
        });
      }

      const now = new Date().toISOString();
      const user = {
        ...validation.user,
        userId: validation.user.userId || buildUserId(validation.user.username),
        active: validation.user.active !== false,
      };

      database
        .prepare(
          `INSERT INTO auth_users (
            clinic_id, user_id, username, display_name, role,
            password_hash, password_salt, active, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          user.clinicId,
          user.userId,
          user.username,
          user.displayName,
          user.role,
          user.passwordHash,
          user.passwordSalt,
          user.active ? 1 : 0,
          now,
          now
        );

      return okUser(user);
    },
    findUserByUsername({ clinicId: requestedClinicId, username }) {
      const row = database
        .prepare(
          `SELECT clinic_id, user_id, username, display_name, role,
                  password_hash, password_salt, active
           FROM auth_users
           WHERE clinic_id = ? AND username = ?`
        )
        .get(normalizeClinicId(requestedClinicId), normalizeUsername(username));

      return row ? freezeClone(mapUserRow(row)) : null;
    },
    findUserById({ clinicId: requestedClinicId, userId }) {
      const row = database
        .prepare(
          `SELECT clinic_id, user_id, username, display_name, role,
                  password_hash, password_salt, active
           FROM auth_users
           WHERE clinic_id = ? AND user_id = ?`
        )
        .get(normalizeClinicId(requestedClinicId), normalizeText(userId));

      return row ? freezeClone(mapUserRow(row)) : null;
    },
    createSession(input) {
      const validation = validateSessionInput(input, clinicId);

      if (!validation.ok) {
        return reject(validation.error);
      }

      const now = new Date().toISOString();
      const session = validation.session;
      database
        .prepare(
          `INSERT INTO auth_sessions (
            clinic_id, session_id, user_id, token_hash,
            expires_at, revoked_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
        )
        .run(
          session.clinicId,
          session.sessionId,
          session.userId,
          session.tokenHash,
          session.expiresAt,
          now,
          now
        );

      return freezeClone({
        status: "ok",
        session: sanitizeSession(session),
      });
    },
    resolveSessionByToken(token) {
      const tokenHash = hashSessionToken(token);

      if (!tokenHash) {
        return null;
      }

      const row = database
        .prepare(
          `SELECT clinic_id, session_id, user_id, token_hash,
                  expires_at, revoked_at, created_at, updated_at
           FROM auth_sessions
           WHERE token_hash = ?`
        )
        .get(tokenHash);

      return row
        ? freezeClone({
            clinicId: row.clinic_id,
            sessionId: row.session_id,
            userId: row.user_id,
            tokenHash: row.token_hash,
            expiresAt: row.expires_at,
            revokedAt: row.revoked_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })
        : null;
    },
    revokeSessionByToken(token) {
      const tokenHash = hashSessionToken(token);

      if (!tokenHash) {
        return false;
      }

      const result = database
        .prepare(
          `UPDATE auth_sessions
           SET revoked_at = ?, updated_at = ?
           WHERE token_hash = ? AND revoked_at IS NULL`
        )
        .run(new Date().toISOString(), new Date().toISOString(), tokenHash);

      return result.changes > 0;
    },
  });
}

function validateUserInput(input, defaultClinicId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return validationError("invalid_auth_user_input", "Auth user input is invalid.");
  }

  const clinicId = normalizeClinicId(input.clinicId || defaultClinicId);
  const username = normalizeUsername(input.username);
  const role = normalizeText(input.role);
  const displayName = normalizeText(input.displayName || username);
  const passwordHash = normalizeText(input.passwordHash);
  const passwordSalt = normalizeText(input.passwordSalt);

  if (!clinicId || !username || !displayName || !passwordHash || !passwordSalt) {
    return validationError("incomplete_auth_user", "Auth user input is incomplete.");
  }

  if (!isValidRole(role)) {
    return validationError("invalid_auth_role", "Auth user role is invalid.");
  }

  return {
    ok: true,
    user: {
      clinicId,
      userId: normalizeText(input.userId),
      username,
      displayName,
      role,
      passwordHash,
      passwordSalt,
      active: input.active !== false,
    },
  };
}

function validateSessionInput(input, defaultClinicId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return validationError("invalid_auth_session_input", "Auth session input is invalid.");
  }

  const clinicId = normalizeClinicId(input.clinicId || defaultClinicId);
  const sessionId = normalizeText(input.sessionId || randomBytes(12).toString("hex"));
  const userId = normalizeText(input.userId);
  const tokenHash = normalizeText(input.tokenHash);
  const expiresAt = normalizeText(input.expiresAt);

  if (!clinicId || !sessionId || !userId || !tokenHash || !expiresAt) {
    return validationError("incomplete_auth_session", "Auth session input is incomplete.");
  }

  return {
    ok: true,
    session: {
      clinicId,
      sessionId,
      userId,
      tokenHash,
      expiresAt,
      revokedAt: null,
    },
  };
}

function mapUserRow(row) {
  return {
    clinicId: row.clinic_id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    active: row.active === 1,
  };
}

function sanitizeUser(user) {
  return {
    clinicId: user.clinicId,
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active === true,
  };
}

function sanitizeSession(session) {
  return {
    clinicId: session.clinicId,
    sessionId: session.sessionId,
    userId: session.userId,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt || null,
  };
}

function okUser(user) {
  return freezeClone({
    status: "ok",
    user: sanitizeUser(user),
  });
}

function reject(error) {
  return freezeClone({ status: "error", error });
}

function validationError(code, message) {
  return { ok: false, error: { code, message } };
}

function buildUserId(username) {
  return `user_${normalizeUsername(username).replace(/[^a-z0-9]+/g, "_")}`;
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeClinicId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  createInMemoryAuthRepository,
  createSqliteAuthRepository,
};
