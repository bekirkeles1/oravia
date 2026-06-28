const { loadEnvFile } = require("../src/config/env");
const { runDemoAvailabilityFlow } = require("../src/appointments/demoAvailabilityFlow");

loadEnvFile();

const sampleMessage =
  process.argv.slice(2).join(" ") ||
  "Merhaba, implant için randevu almak istiyorum.";

const result = runDemoAvailabilityFlow(sampleMessage);

console.log(JSON.stringify(result, null, 2));
