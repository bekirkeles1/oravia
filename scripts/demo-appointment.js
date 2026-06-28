const { loadEnvFile } = require("../src/config/env");
const { runDemoAppointmentFlow } = require("../src/appointments/appointmentCreation");

loadEnvFile();

const [initialMessage, selectionMessage] = process.argv.slice(2);

const result = runDemoAppointmentFlow({
  initialMessage,
  selectionMessage
});

console.log(JSON.stringify(result, null, 2));
