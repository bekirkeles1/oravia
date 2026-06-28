const { loadEnvFile } = require("../src/config/env");
const { classifyPatientMessage } = require("../src/ai/intentClassifier");

loadEnvFile();

const sampleMessage =
  process.argv.slice(2).join(" ") ||
  "Merhaba, implant için randevu almak istiyorum.";

const result = classifyPatientMessage(sampleMessage);

console.log(JSON.stringify(result, null, 2));
