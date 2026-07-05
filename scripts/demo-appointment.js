const { loadEnvFile } = require("../src/config/env");
const { runDemoAppointmentFlow } = require("../src/appointments/appointmentCreation");

loadEnvFile();

const [initialMessage, selectionMessage] = process.argv.slice(2);

async function main() {
  const result = await runDemoAppointmentFlow({
    initialMessage,
    selectionMessage
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
