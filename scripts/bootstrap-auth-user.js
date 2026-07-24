const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

const { createAuthRuntime } = require("../src/auth/authRepositoryFactory");
const { createUserWithPassword } = require("../src/auth/authService");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const username = String(args.username || "").trim().toLowerCase();
  const role = String(args.role || "manager").trim();
  const displayName = String(args.displayName || username).trim();

  if (!username) {
    throw new Error("Use --username to provide a safe local user identity.");
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const password = await rl.question("Password: ");
  rl.close();

  const runtime = createAuthRuntime({});

  try {
    const result = createUserWithPassword({
      repository: runtime.repository,
      user: {
        clinicId: runtime.clinicId,
        username,
        displayName,
        role,
        password,
      },
    });

    if (result.status !== "ok") {
      console.error(`User creation failed: ${result.error.code}`);
      process.exitCode = 1;
      return;
    }

    console.log(`Created ${result.user.role} user ${result.user.username}.`);
  } finally {
    runtime.close();
  }
}

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];

    if (item.startsWith("--")) {
      parsed[item.slice(2)] = args[index + 1];
      index += 1;
    }
  }

  return parsed;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
