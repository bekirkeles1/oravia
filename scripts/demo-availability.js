const { loadEnvFile } = require("../src/config/env");
const { runDemoAvailabilityFlow } = require("../src/appointments/demoAvailabilityFlow");

loadEnvFile();

const sampleMessage =
  process.argv.slice(2).join(" ") ||
  "Merhaba, implant için randevu almak istiyorum.";

async function main() {
  const result = await runDemoAvailabilityFlow(sampleMessage);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
