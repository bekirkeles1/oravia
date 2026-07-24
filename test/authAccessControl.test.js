const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const authCookies = require("../src/auth/authCookies");
const {
  AUTH_PERMISSIONS,
  AUTH_ROLES,
  roleHasPermission,
} = require("../src/auth/authRoles");
const {
  createAuthRuntime,
} = require("../src/auth/authRepositoryFactory");
const {
  createInMemoryAuthRepository,
} = require("../src/auth/authRepositories");
const {
  authenticateCredentials,
  createUserWithPassword,
  resolveCurrentSession,
} = require("../src/auth/authService");
const { hashPassword, verifyPassword } = require("../src/auth/passwordHashing");
const {
  createSessionToken,
  hashSessionToken,
} = require("../src/auth/sessionToken");
const appointmentsRoute = require("../app/api/secretary/appointments/route");
const availabilityRoute = require("../app/api/secretary/doctors/availability/route");
const confirmationRoute = require("../app/api/secretary/appointments/[appointmentId]/confirmation-message/route");
const loginRoute = require("../app/api/auth/login/route");
const currentUserRoute = require("../app/api/auth/current-user/route");
const logoutRoute = require("../app/api/auth/logout/route");

function createTempDatabasePath(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `oravia-auth-${label}-`));

  return {
    dir,
    databasePath: path.join(dir, "auth.sqlite"),
  };
}

function cleanupTempDatabase({ dir, databasePath }) {
  for (const file of [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    `${databasePath}-journal`,
  ]) {
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
    }
  }

  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function withAuthEnv(temp, work) {
  const previous = {
    ORAVIA_AUTH_REQUIRED: process.env.ORAVIA_AUTH_REQUIRED,
    ORAVIA_STORAGE_MODE: process.env.ORAVIA_STORAGE_MODE,
    ORAVIA_SQLITE_DATABASE_PATH: process.env.ORAVIA_SQLITE_DATABASE_PATH,
    ORAVIA_CLINIC_ID: process.env.ORAVIA_CLINIC_ID,
  };

  process.env.ORAVIA_AUTH_REQUIRED = "true";
  process.env.ORAVIA_STORAGE_MODE = "sqlite";
  process.env.ORAVIA_SQLITE_DATABASE_PATH = temp.databasePath;
  process.env.ORAVIA_CLINIC_ID = "clinic_auth_test";

  return Promise.resolve()
    .then(work)
    .finally(() => {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    });
}

function createJsonRequest(url, payload, { cookie, origin, host } = {}) {
  const headers = {
    "content-type": "application/json",
  };

  if (cookie) {
    headers.cookie = cookie;
  }

  if (origin) {
    headers.origin = origin;
  }

  if (host) {
    headers.host = host;
  }

  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

function createGetRequest(url, { cookie } = {}) {
  return new Request(url, {
    method: "GET",
    headers: cookie ? { cookie } : {},
  });
}

function sessionCookie(token) {
  return `${authCookies.SESSION_COOKIE_NAME}=${token}`;
}

function createUser(username, password, role = AUTH_ROLES.MANAGER) {
  const runtime = createAuthRuntime({});

  try {
    return createUserWithPassword({
      repository: runtime.repository,
      user: {
        clinicId: runtime.clinicId,
        username,
        displayName: username,
        role,
        password,
      },
    });
  } finally {
    runtime.close();
  }
}

function loginUser(username, password) {
  const runtime = createAuthRuntime({});

  try {
    return authenticateCredentials({
      repository: runtime.repository,
      clinicId: runtime.clinicId,
      username,
      password,
    });
  } finally {
    runtime.close();
  }
}

test("password hashes use unique salts and never accept plaintext mismatch", () => {
  const first = hashPassword("manager password 1");
  const second = hashPassword("manager password 1");

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.notEqual(first.passwordSalt, second.passwordSalt);
  assert.notEqual(first.passwordHash, "manager password 1");
  assert.notEqual(first.passwordHash, second.passwordHash);
  assert.equal(
    verifyPassword({
      password: "manager password 1",
      passwordHash: first.passwordHash,
      passwordSalt: first.passwordSalt,
    }),
    true
  );
  assert.equal(
    verifyPassword({
      password: "wrong password",
      passwordHash: first.passwordHash,
      passwordSalt: first.passwordSalt,
    }),
    false
  );
});

test("session tokens are opaque and resolved through server-side hashes", () => {
  const repository = createInMemoryAuthRepository({ clinicId: "clinic_auth" });
  const user = createUserWithPassword({
    repository,
    user: {
      clinicId: "clinic_auth",
      username: "manager",
      displayName: "Manager",
      role: AUTH_ROLES.MANAGER,
      password: "manager password 1",
    },
  });
  const authResult = authenticateCredentials({
    repository,
    clinicId: "clinic_auth",
    username: "manager",
    password: "manager password 1",
  });

  assert.equal(user.status, "ok");
  assert.equal(authResult.accepted, true);
  assert.equal(authResult.user.passwordHash, undefined);
  assert.equal(authResult.user.passwordSalt, undefined);
  assert.equal(authResult.session.token, undefined);
  assert.equal(authResult.session.tokenHash, undefined);
  assert.equal(
    repository.resolveSessionByToken(authResult.token).tokenHash,
    hashSessionToken(authResult.token)
  );

  const resolved = resolveCurrentSession({
    repository,
    token: authResult.token,
  });

  assert.equal(resolved.accepted, true);
  assert.equal(resolved.actor.role, AUTH_ROLES.MANAGER);
});

test("RBAC grants manager and secretary mutations but keeps doctor read-only", () => {
  assert.equal(
    roleHasPermission(
      AUTH_ROLES.MANAGER,
      AUTH_PERMISSIONS.MUTATE_CONFIRMATION_DISPATCH
    ),
    true
  );
  assert.equal(
    roleHasPermission(
      AUTH_ROLES.SECRETARY,
      AUTH_PERMISSIONS.MUTATE_APPOINTMENT_CREATION
    ),
    true
  );
  assert.equal(
    roleHasPermission(
      AUTH_ROLES.SECRETARY,
      AUTH_PERMISSIONS.MUTATE_DOCTOR_AVAILABILITY
    ),
    true
  );
  assert.equal(
    roleHasPermission(
      AUTH_ROLES.DOCTOR,
      AUTH_PERMISSIONS.MUTATE_CONFIRMATION_DISPATCH
    ),
    false
  );
  assert.equal(
    roleHasPermission(AUTH_ROLES.DOCTOR, AUTH_PERMISSIONS.READ_INTERNAL),
    true
  );
});

test("sqlite auth repository persists users and stores only session hashes", async () => {
  const temp = createTempDatabasePath("sqlite");

  try {
    await withAuthEnv(temp, () => {
      createUser("manager", "manager password 1");
      const authResult = loginUser("manager", "manager password 1");

      assert.equal(authResult.accepted, true);

      const reopened = createAuthRuntime({});
      try {
        const resolved = resolveCurrentSession({
          repository: reopened.repository,
          token: authResult.token,
        });

        assert.equal(resolved.accepted, true);
        assert.equal(resolved.actor.username, "manager");
      } finally {
        reopened.close();
      }

      const database = new DatabaseSync(temp.databasePath, { readOnly: true });
      try {
        const sessionRow = database
          .prepare("SELECT token_hash FROM auth_sessions LIMIT 1")
          .get();
        const userRow = database
          .prepare(
            "SELECT password_hash, password_salt FROM auth_users WHERE username = ?"
          )
          .get("manager");

        assert.equal(sessionRow.token_hash, hashSessionToken(authResult.token));
        assert.notEqual(sessionRow.token_hash, authResult.token);
        assert.notEqual(userRow.password_hash, "manager password 1");
        assert.ok(userRow.password_salt);
      } finally {
        database.close();
      }
    });
  } finally {
    cleanupTempDatabase(temp);
  }
});

test("auth route handlers login current-user and logout without exposing token JSON", async () => {
  const temp = createTempDatabasePath("routes");

  try {
    await withAuthEnv(temp, async () => {
      createUser("route-manager", "manager password 1");

      const loginResponse = await loginRoute.POST(
        createJsonRequest("http://localhost/api/auth/login", {
          username: "route-manager",
          password: "manager password 1",
        })
      );
      const loginBody = await loginResponse.json();
      const cookie = loginResponse.headers.get("set-cookie");

      assert.equal(loginResponse.status, 200);
      assert.equal(loginBody.accepted, true);
      assert.equal(loginBody.token, undefined);
      assert.equal(loginBody.session.token, undefined);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.match(cookie, /Path=\//i);

      const currentResponse = await currentUserRoute.GET(
        createGetRequest("http://localhost/api/auth/current-user", {
          cookie,
        })
      );
      const currentBody = await currentResponse.json();

      assert.equal(currentResponse.status, 200);
      assert.equal(currentBody.accepted, true);
      assert.equal(currentBody.user.role, AUTH_ROLES.MANAGER);

      const logoutResponse = await logoutRoute.POST(
        createJsonRequest(
          "http://localhost/api/auth/logout",
          {},
          {
            cookie,
          }
        )
      );
      const clearCookie = logoutResponse.headers.get("set-cookie");

      assert.equal(logoutResponse.status, 200);
      assert.match(clearCookie, /Max-Age=0/);

      const afterLogoutResponse = await currentUserRoute.GET(
        createGetRequest("http://localhost/api/auth/current-user", {
          cookie,
        })
      );

      assert.equal(afterLogoutResponse.status, 401);
    });
  } finally {
    cleanupTempDatabase(temp);
  }
});

test("protected routes return 401 without cookie and 403 for doctor mutation before provider runtime", async () => {
  const temp = createTempDatabasePath("rbac");

  try {
    await withAuthEnv(temp, async () => {
      const unauthenticated = await appointmentsRoute.GET(
        createGetRequest("http://localhost/api/secretary/appointments")
      );
      const unauthenticatedBody = await unauthenticated.json();

      assert.equal(unauthenticated.status, 401);
      assert.equal(unauthenticatedBody.code, "unauthorized");

      createUser("doctor", "doctor password 1", AUTH_ROLES.DOCTOR);
      const doctorAuth = loginUser("doctor", "doctor password 1");
      assert.equal(doctorAuth.accepted, true);

      let runtimeCreated = false;
      const forbidden = await confirmationRoute.POST(
        createJsonRequest(
          "http://localhost/api/secretary/appointments/appointment_1/confirmation-message",
          {
            expectedAppointmentVersion: 1,
            idempotencyKey: "confirmation_dispatch:rbac:doctor",
            confirmation: "send_mock_appointment_confirmation",
          },
          {
            cookie: sessionCookie(doctorAuth.token),
          }
        ),
        { params: { appointmentId: "appointment_1" } },
        {
          createRouteRuntimeAdapter() {
            runtimeCreated = true;
            throw new Error("auth should fail before runtime");
          },
        }
      );
      const forbiddenBody = await forbidden.json();

      assert.equal(forbidden.status, 403);
      assert.equal(forbiddenBody.code, "forbidden");
      assert.equal(runtimeCreated, false);
    });
  } finally {
    cleanupTempDatabase(temp);
  }
});

test("mutation routes reject cross-origin cookie-auth requests and client trusted auth fields", async () => {
  const temp = createTempDatabasePath("csrf");

  try {
    await withAuthEnv(temp, async () => {
      createUser("secretary", "secretary password 1", AUTH_ROLES.SECRETARY);
      const secretaryAuth = loginUser("secretary", "secretary password 1");
      assert.equal(secretaryAuth.accepted, true);

      const csrf = await availabilityRoute.PATCH(
        new Request("http://localhost/api/secretary/doctors/availability", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: sessionCookie(secretaryAuth.token),
            origin: "https://evil.example",
            host: "localhost",
          },
          body: JSON.stringify({
            doctorId: "dr-ayse-demir",
            day: "wednesday",
            enabled: true,
            windows: [{ start: "09:00", end: "12:00" }],
          }),
        })
      );
      const csrfBody = await csrf.json();

      assert.equal(csrf.status, 403);
      assert.equal(csrfBody.code, "invalid_origin");

      const injected = await confirmationRoute.POST(
        createJsonRequest(
          "http://localhost/api/secretary/appointments/appointment_1/confirmation-message",
          {
            expectedAppointmentVersion: 1,
            idempotencyKey: "confirmation_dispatch:rbac:injection",
            confirmation: "send_mock_appointment_confirmation",
            role: "manager",
          },
          {
            cookie: sessionCookie(secretaryAuth.token),
          }
        ),
        { params: { appointmentId: "appointment_1" } }
      );
      const injectedBody = await injected.json();

      assert.equal(injected.status, 400);
      assert.equal(
        injectedBody.code,
        "client_trusted_confirmation_dispatch_injection"
      );
    });
  } finally {
    cleanupTempDatabase(temp);
  }
});

test("session token helper keeps raw token distinct from server hash", () => {
  const token = createSessionToken();

  assert.ok(token.token.length >= 32);
  assert.equal(token.tokenHash, hashSessionToken(token.token));
  assert.notEqual(token.tokenHash, token.token);
});
