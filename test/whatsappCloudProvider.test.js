const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const {
  resolveWhatsAppConfig,
  WHATSAPP_PROVIDER_MODES,
} = require("../src/messaging/whatsappConfig");
const {
  createChannelIdentityCrypto,
} = require("../src/messaging/whatsappChannelIdentityCrypto");
const {
  createMetaWhatsAppOutboundProvider,
} = require("../src/messaging/metaWhatsAppOutboundProvider");
const {
  createWebhookSignature,
  verifyWebhookSignature,
} = require("../src/messaging/whatsappWebhookSignature");
const {
  createWhatsAppRuntime,
} = require("../src/messaging/whatsappRuntime");
const {
  canAdvanceStatus,
} = require("../src/messaging/whatsappStatusLifecycle");
const {
  mapAppointmentConfirmationTemplateParameters,
} = require("../src/messaging/whatsappTemplateMapper");
const { createAuthRuntime } = require("../src/auth/authRepositoryFactory");
const {
  createUserWithPassword,
  authenticateCredentials,
} = require("../src/auth/authService");
const authCookies = require("../src/auth/authCookies");
const webhookRoute = require("../app/api/webhooks/whatsapp/route");
const statusRoute = require("../app/api/integrations/whatsapp/status/route");
const {
  dispatchAppointmentConfirmation,
} = require("../src/api/secretaryAppointmentConfirmationDispatchService");
const {
  createInMemoryAppointmentReviewAppointmentRepository,
} = require("../src/secretary/appointmentReviewAppointmentRepository");
const {
  createInMemoryAppointmentReviewExecutionIdempotencyStore,
} = require("../src/secretary/appointmentReviewExecutionIdempotencyStore");

const MASTER_KEY = "synthetic channel identity master key 1234567890";

function createTempDatabasePath(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `oravia-wa-${label}-`));
  return { dir, databasePath: path.join(dir, "wa.sqlite") };
}

function cleanupTempDatabase({ dir, databasePath }) {
  for (const file of [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    `${databasePath}-journal`,
  ]) {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function withMetaEnv(temp, work, extra = {}) {
  const previous = {};
  const next = {
    ORAVIA_AUTH_REQUIRED: "true",
    ORAVIA_STORAGE_MODE: "sqlite",
    ORAVIA_SQLITE_DATABASE_PATH: temp.databasePath,
    ORAVIA_CLINIC_ID: "clinic_whatsapp_test",
    ORAVIA_WHATSAPP_PROVIDER_MODE: "meta_cloud",
    ORAVIA_WHATSAPP_GRAPH_API_VERSION: "v99.0",
    ORAVIA_WHATSAPP_GRAPH_BASE_URL: "https://graph.example.test",
    ORAVIA_WHATSAPP_PHONE_NUMBER_ID: "phone_number_12345",
    ORAVIA_WHATSAPP_WABA_ID: "waba_12345",
    ORAVIA_WHATSAPP_ACCESS_TOKEN: "synthetic-access-token-value",
    ORAVIA_WHATSAPP_APP_SECRET: "synthetic-app-secret-value",
    ORAVIA_WHATSAPP_WEBHOOK_VERIFY_TOKEN: "synthetic-verify-token",
    ORAVIA_WHATSAPP_APPOINTMENT_TEMPLATE_NAME: "appointment_confirmation",
    ORAVIA_WHATSAPP_TEMPLATE_LANGUAGE: "tr",
    ORAVIA_WHATSAPP_CHANNEL_IDENTITY_KEY: MASTER_KEY,
    ...extra,
  };

  for (const name of Object.keys(next)) {
    previous[name] = process.env[name];
    process.env[name] = next[name];
  }

  return Promise.resolve()
    .then(work)
    .finally(() => {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    });
}

function createFakeTransport() {
  const calls = [];

  return {
    calls,
    async postJson(command) {
      calls.push(JSON.parse(JSON.stringify(command)));
      return {
        accepted: true,
        ok: true,
        status: 200,
        parseOk: true,
        body: {
          messages: [{ id: `wamid.${calls.length}` }],
        },
      };
    },
  };
}

function createSignedRequest(payload) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  return new Request("http://localhost/api/webhooks/whatsapp", {
    method: "POST",
    headers: {
      "x-hub-signature-256": createWebhookSignature({
        rawBody,
        appSecret: process.env.ORAVIA_WHATSAPP_APP_SECRET,
      }),
      "content-type": "application/json",
    },
    body: rawBody,
  });
}

function inboundPayload({ id = "wamid.inbound.1", text = "Implant icin randevu istiyorum", type = "text" } = {}) {
  const message =
    type === "text"
      ? { id, from: "905550001122", timestamp: "1780000000", type, text: { body: text } }
      : { id, from: "905550001122", timestamp: "1780000000", type };

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba_12345",
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                phone_number_id: "phone_number_12345",
              },
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

function statusPayload(status, providerMessageId = "wamid.1") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba_12345",
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                phone_number_id: "phone_number_12345",
              },
              statuses: [
                {
                  id: providerMessageId,
                  status,
                  timestamp: "1780000001",
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function createManagerCookie() {
  let runtime = createAuthRuntime({});
  try {
    createUserWithPassword({
      repository: runtime.repository,
      user: {
        clinicId: runtime.clinicId,
        username: "manager",
        displayName: "Manager",
        role: "manager",
        password: "manager password 1",
      },
    });
  } finally {
    runtime.close();
  }

  runtime = createAuthRuntime({});
  try {
    const auth = authenticateCredentials({
      repository: runtime.repository,
      clinicId: runtime.clinicId,
      username: "manager",
      password: "manager password 1",
    });
    return `${authCookies.SESSION_COOKIE_NAME}=${auth.token}`;
  } finally {
    runtime.close();
  }
}

function createRoleCookie(username, role) {
  let runtime = createAuthRuntime({});
  try {
    createUserWithPassword({
      repository: runtime.repository,
      user: {
        clinicId: runtime.clinicId,
        username,
        displayName: username,
        role,
        password: `${username} password 1`,
      },
    });
  } finally {
    runtime.close();
  }

  runtime = createAuthRuntime({});
  try {
    const auth = authenticateCredentials({
      repository: runtime.repository,
      clinicId: runtime.clinicId,
      username,
      password: `${username} password 1`,
    });
    return `${authCookies.SESSION_COOKIE_NAME}=${auth.token}`;
  } finally {
    runtime.close();
  }
}

test("WhatsApp configuration defaults to mock and Meta fails closed without secrets", () => {
  assert.equal(resolveWhatsAppConfig({}).providerMode, WHATSAPP_PROVIDER_MODES.MOCK);

  const incomplete = resolveWhatsAppConfig({
    ORAVIA_WHATSAPP_PROVIDER_MODE: "meta_cloud",
    ORAVIA_CLINIC_ID: "clinic_a",
  });

  assert.equal(incomplete.accepted, false);
  assert.equal(incomplete.code, "incomplete_meta_whatsapp_config");
  assert.ok(incomplete.missing.includes("accessToken"));
  assert.doesNotMatch(JSON.stringify(incomplete), /synthetic-access-token-value/);
});

test("channel identity encryption is random tamper-safe lookup deterministic and clinic isolated", () => {
  const cryptoA = createChannelIdentityCrypto({ masterKey: MASTER_KEY });
  const first = cryptoA.encryptIdentity({
    clinicId: "clinic_a",
    provider: "meta_cloud",
    businessPhoneNumberId: "phone_1",
    rawIdentity: "905550001122",
  });
  const second = cryptoA.encryptIdentity({
    clinicId: "clinic_a",
    provider: "meta_cloud",
    businessPhoneNumberId: "phone_1",
    rawIdentity: "905550001122",
  });

  assert.equal(first.accepted, true);
  assert.notEqual(first.encrypted.ciphertext, second.encrypted.ciphertext);
  assert.equal(first.lookupHash, second.lookupHash);
  assert.equal(first.maskedLabel, "whatsapp:***22");
  assert.doesNotMatch(JSON.stringify(first), /905550001122/);

  const decrypted = cryptoA.decryptIdentity({
    clinicId: "clinic_a",
    provider: "meta_cloud",
    businessPhoneNumberId: "phone_1",
    encrypted: first.encrypted,
  });

  assert.equal(decrypted.rawIdentity, "905550001122");
  assert.notEqual(
    first.lookupHash,
    cryptoA.createLookupHash({
      clinicId: "clinic_b",
      provider: "meta_cloud",
      businessPhoneNumberId: "phone_1",
      rawIdentity: "905550001122",
    })
  );

  const tampered = {
    ...first.encrypted,
    ciphertext: first.encrypted.ciphertext.replace(/.$/, "A"),
  };
  assert.equal(
    cryptoA.decryptIdentity({
      clinicId: "clinic_a",
      provider: "meta_cloud",
      businessPhoneNumberId: "phone_1",
      encrypted: tampered,
    }).accepted,
    false
  );
});

test("Meta provider builds configured text and template Graph requests without leaking raw errors", async () => {
  const config = resolveWhatsAppConfig({
    ORAVIA_WHATSAPP_PROVIDER_MODE: "meta_cloud",
    ORAVIA_CLINIC_ID: "clinic_whatsapp_test",
    ORAVIA_WHATSAPP_GRAPH_API_VERSION: "v99.0",
    ORAVIA_WHATSAPP_GRAPH_BASE_URL: "https://graph.example.test",
    ORAVIA_WHATSAPP_PHONE_NUMBER_ID: "phone_number_12345",
    ORAVIA_WHATSAPP_ACCESS_TOKEN: "synthetic-access-token-value",
    ORAVIA_WHATSAPP_APP_SECRET: "synthetic-app-secret-value",
    ORAVIA_WHATSAPP_WEBHOOK_VERIFY_TOKEN: "synthetic-verify-token",
    ORAVIA_WHATSAPP_APPOINTMENT_TEMPLATE_NAME: "appointment_confirmation",
    ORAVIA_WHATSAPP_TEMPLATE_LANGUAGE: "tr",
    ORAVIA_WHATSAPP_CHANNEL_IDENTITY_KEY: MASTER_KEY,
  });
  const identityCrypto = createChannelIdentityCrypto({ masterKey: MASTER_KEY });
  const encrypted = identityCrypto.encryptIdentity({
    clinicId: config.clinicId,
    provider: "meta_cloud",
    businessPhoneNumberId: config.phoneNumberId,
    rawIdentity: "905550001122",
  });
  const transport = createFakeTransport();
  const provider = createMetaWhatsAppOutboundProvider({
    config,
    transport,
    identityCrypto,
  });

  const text = await provider.sendConversationReply({
    destination: {
      lookupHash: encrypted.lookupHash,
      encryptedIdentity: encrypted.encrypted,
      maskedLabel: encrypted.maskedLabel,
    },
    message: { text: "Safe server reply" },
  });

  assert.equal(text.accepted, true);
  assert.equal(transport.calls[0].url, "https://graph.example.test/v99.0/phone_number_12345/messages");
  assert.equal(transport.calls[0].body.type, "text");
  assert.equal(transport.calls[0].body.to, "905550001122");
  assert.equal(transport.calls[0].accessToken, "synthetic-access-token-value");

  const template = await provider.sendAppointmentConfirmation({
    appointmentId: "appointment_1",
    destination: {
      lookupHash: encrypted.lookupHash,
      encryptedIdentity: encrypted.encrypted,
      maskedLabel: encrypted.maskedLabel,
    },
    appointment: {
      doctor: { name: "Dr. Synthetic" },
      appointmentPurposeLabel: "Initial consultation",
      startAt: "2026-07-29T10:30:00+03:00",
    },
  });

  assert.equal(template.accepted, true);
  assert.equal(transport.calls[1].body.type, "template");
  assert.equal(transport.calls[1].body.template.name, "appointment_confirmation");
  assert.deepEqual(
    transport.calls[1].body.template.components[0].parameters.map((item) => item.type),
    ["text", "text", "text", "text", "text"]
  );

  const failingProvider = createMetaWhatsAppOutboundProvider({
    config,
    identityCrypto,
    transport: {
      async postJson() {
        return {
          accepted: true,
          ok: false,
          status: 400,
          parseOk: true,
          body: { error: { message: "raw provider details", code: 190 } },
        };
      },
    },
  });
  const failure = await failingProvider.sendConversationReply({
    destination: {
      lookupHash: encrypted.lookupHash,
      encryptedIdentity: encrypted.encrypted,
      maskedLabel: encrypted.maskedLabel,
    },
    message: { text: "Safe server reply" },
  });

  assert.equal(failure.accepted, false);
  assert.equal(failure.errorCode, 190);
  assert.doesNotMatch(JSON.stringify(failure), /raw provider details|synthetic-access-token-value|905550001122/);
});

test("template mapper is deterministic and excludes clinical or internal fields", () => {
  const input = {
    clinicDisplayName: "Synthetic Clinic",
    appointment: {
      doctor: { name: "Dr. Synthetic" },
      appointmentPurposeLabel: "Initial consultation",
      startAt: "2026-07-29T10:30:00+03:00",
      rawTreatmentNotes: "do not include",
      repositoryVersion: 7,
      rawInboundMessage: "medical text",
    },
  };
  const first = mapAppointmentConfirmationTemplateParameters(input);
  const second = mapAppointmentConfirmationTemplateParameters(input);

  assert.equal(first.accepted, true);
  assert.deepEqual(first, second);
  assert.deepEqual(first.parameterOrder, [
    "clinic_display_name",
    "doctor_display_name",
    "appointment_date",
    "appointment_time",
    "appointment_purpose",
  ]);
  assert.doesNotMatch(JSON.stringify(first), /do not include|repository|medical text/);
});

test("webhook signature validates raw body and rejects malformed altered or missing signatures", () => {
  const rawBody = Buffer.from(JSON.stringify({ ok: true }));
  const signature = createWebhookSignature({
    rawBody,
    appSecret: "synthetic-app-secret-value",
  });

  assert.equal(
    verifyWebhookSignature({
      rawBody,
      signatureHeader: signature,
      appSecret: "synthetic-app-secret-value",
    }).accepted,
    true
  );
  assert.equal(
    verifyWebhookSignature({
      rawBody: Buffer.from(JSON.stringify({ ok: false })),
      signatureHeader: signature,
      appSecret: "synthetic-app-secret-value",
    }).accepted,
    false
  );
  assert.equal(
    verifyWebhookSignature({
      rawBody,
      signatureHeader: "",
      appSecret: "synthetic-app-secret-value",
    }).accepted,
    false
  );
  assert.equal(
    verifyWebhookSignature({
      rawBody,
      signatureHeader: "sha1=bad",
      appSecret: "synthetic-app-secret-value",
    }).accepted,
    false
  );
});

test("in-process webhook route verifies challenges processes text dedupes and advances lifecycle durably", async () => {
  const temp = createTempDatabasePath("integration");
  try {
    await withMetaEnv(temp, async () => {
      globalThis.__ORAVIA_WHATSAPP_TEST_TRANSPORT__ = createFakeTransport();
      const verify = await webhookRoute.GET(
        new Request(
          "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=challenge_ok"
        )
      );
      assert.equal(verify.status, 200);
      assert.equal(await verify.text(), "challenge_ok");

      const invalid = await webhookRoute.GET(
        new Request(
          "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge_ok"
        )
      );
      assert.equal(invalid.status, 403);

      const first = await webhookRoute.POST(createSignedRequest(inboundPayload()));
      const firstBody = await first.json();
      assert.equal(first.status, 200);
      assert.equal(firstBody.results[0].code, "whatsapp_text_processed");

      const duplicate = await webhookRoute.POST(createSignedRequest(inboundPayload()));
      const duplicateBody = await duplicate.json();
      assert.equal(duplicate.status, 200);
      assert.equal(duplicateBody.results[0].duplicate, true);

      for (const providerStatus of ["sent", "delivered", "read", "sent"]) {
        const statusResponse = await webhookRoute.POST(
          createSignedRequest(statusPayload(providerStatus, "wamid.1"))
        );
        assert.equal(statusResponse.status, 200);
      }

      let runtime = createWhatsAppRuntime({});
      try {
        assert.equal(runtime.accepted, true);
        assert.equal(runtime.getSafeIntegrationStatus().latest.outbound.providerStatus, "read");
      } finally {
        runtime.close();
      }

      runtime = createWhatsAppRuntime({});
      try {
        const repo = runtime.lifecycleRepository;
        const reserved = repo.reserveInboundEvent({
          provider: "meta_cloud",
          providerEventId: "wamid.inbound.1",
          businessPhoneNumberId: "phone_number_12345",
          senderLookupHash: "synthetic",
          messageType: "text",
          eventFingerprint: crypto
            .createHash("sha256")
            .update(
              JSON.stringify({
                providerEventId: "wamid.inbound.1",
                sender: "905550001122",
                messageType: "text",
                text: "Implant icin randevu istiyorum",
              })
            )
            .digest("base64url"),
        });
        assert.equal(reserved.duplicate, true);
        assert.doesNotMatch(JSON.stringify(runtime.getSafeIntegrationStatus()), /905550001122|Implant icin randevu/);
      } finally {
        runtime.close();
        delete globalThis.__ORAVIA_WHATSAPP_TEST_TRANSPORT__;
      }
    }, { ORAVIA_WHATSAPP_AUTO_REPLY_MODE: "safe_reply" });
  } finally {
    cleanupTempDatabase(temp);
  }
});

test("manager status route is manager-only and never returns secrets", async () => {
  const temp = createTempDatabasePath("status");
  try {
    await withMetaEnv(temp, async () => {
      const unauthenticated = await statusRoute.GET(
        new Request("http://localhost/api/integrations/whatsapp/status")
      );
      assert.equal(unauthenticated.status, 401);

      const cookie = createManagerCookie();
      const secretaryCookie = createRoleCookie("secretary-status", "secretary");
      const doctorCookie = createRoleCookie("doctor-status", "doctor");
      const response = await statusRoute.GET(
        new Request("http://localhost/api/integrations/whatsapp/status", {
          headers: { cookie },
        })
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.providerMode, "meta_cloud");
      assert.equal(body.phoneNumberIdMasked, "***2345");
      assert.doesNotMatch(JSON.stringify(body), /synthetic-access-token-value|synthetic-app-secret-value|synthetic-verify-token|905550001122/);

      const secretary = await statusRoute.GET(
        new Request("http://localhost/api/integrations/whatsapp/status", {
          headers: { cookie: secretaryCookie },
        })
      );
      const doctor = await statusRoute.GET(
        new Request("http://localhost/api/integrations/whatsapp/status", {
          headers: { cookie: doctorCookie },
        })
      );

      assert.equal(secretary.status, 403);
      assert.equal(doctor.status, 403);
    });
  } finally {
    cleanupTempDatabase(temp);
  }
});

test("status ordering prevents regression and keeps repeated statuses idempotent", () => {
  assert.equal(canAdvanceStatus("accepted", "sent"), true);
  assert.equal(canAdvanceStatus("sent", "delivered"), true);
  assert.equal(canAdvanceStatus("delivered", "read"), true);
  assert.equal(canAdvanceStatus("read", "sent"), false);
  assert.equal(canAdvanceStatus("read", "failed"), false);
  assert.equal(canAdvanceStatus("sent", "sent"), true);
});

test("Meta appointment confirmation uses template accepted state and idempotency blocks resend", async () => {
  const appointmentRepository =
    createInMemoryAppointmentReviewAppointmentRepository();
  const identityCrypto = createChannelIdentityCrypto({ masterKey: MASTER_KEY });
  const encrypted = identityCrypto.encryptIdentity({
    clinicId: "clinic_whatsapp_test",
    provider: "meta_cloud",
    businessPhoneNumberId: "phone_number_12345",
    rawIdentity: "905550001122",
  });
  const created = appointmentRepository.createAppointment({
    sourceReviewId: "review_meta_confirmation",
    selectedSlotId: "slot_meta_confirmation",
    doctorId: "dr-synthetic",
    doctorName: "Dr. Synthetic",
    treatment: "implant",
    appointmentPurpose: "initial_consultation",
    appointmentPurposeLabel: "Initial consultation",
    startAt: "2026-07-29T10:30:00+03:00",
    endAt: "2026-07-29T11:00:00+03:00",
    durationMinutes: 30,
    outboundDestination: {
      channel: "whatsapp",
      lookupHash: encrypted.lookupHash,
      encryptedIdentity: encrypted.encrypted,
      maskedLabel: encrypted.maskedLabel,
    },
  });
  const transport = createFakeTransport();
  const provider = createMetaWhatsAppOutboundProvider({
    config: resolveWhatsAppConfig({
      ORAVIA_WHATSAPP_PROVIDER_MODE: "meta_cloud",
      ORAVIA_CLINIC_ID: "clinic_whatsapp_test",
      ORAVIA_WHATSAPP_GRAPH_API_VERSION: "v99.0",
      ORAVIA_WHATSAPP_GRAPH_BASE_URL: "https://graph.example.test",
      ORAVIA_WHATSAPP_PHONE_NUMBER_ID: "phone_number_12345",
      ORAVIA_WHATSAPP_ACCESS_TOKEN: "synthetic-access-token-value",
      ORAVIA_WHATSAPP_APP_SECRET: "synthetic-app-secret-value",
      ORAVIA_WHATSAPP_WEBHOOK_VERIFY_TOKEN: "synthetic-verify-token",
      ORAVIA_WHATSAPP_APPOINTMENT_TEMPLATE_NAME: "appointment_confirmation",
      ORAVIA_WHATSAPP_TEMPLATE_LANGUAGE: "tr",
      ORAVIA_WHATSAPP_CHANNEL_IDENTITY_KEY: MASTER_KEY,
    }),
    transport,
    identityCrypto,
  });
  const idempotencyStore = createInMemoryAppointmentReviewExecutionIdempotencyStore();
  const input = {
    appointmentId: created.appointment.id,
    expectedAppointmentVersion: created.appointment.version,
    idempotencyKey: "confirmation_dispatch:meta:1",
    confirmation: "send_mock_appointment_confirmation",
    appointmentRepository,
    outboundMessagingProvider: provider,
    idempotencyStore,
  };
  const first = await dispatchAppointmentConfirmation(input);
  const replay = await dispatchAppointmentConfirmation(input);
  const already = await dispatchAppointmentConfirmation({
    ...input,
    idempotencyKey: "confirmation_dispatch:meta:2",
    expectedAppointmentVersion: first.resultingAppointmentVersion,
  });

  assert.equal(first.accepted, true);
  assert.equal(first.appointment.confirmationMessageStatus, "accepted");
  assert.equal(first.messageSent, false);
  assert.equal(replay.accepted, true);
  assert.equal(already.alreadyConfirmed, true);
  assert.equal(transport.calls.length, 1);
  assert.equal(transport.calls[0].body.type, "template");
});
