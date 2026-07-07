const { listDoctors } = require("../clinic/doctorDirectory");
const { listDoctorAvailability } = require("../clinic/doctorAvailability");

function createSuccessResponse(payload) {
  return {
    statusCode: 200,
    body: {
      status: "ok",
      source: "mock",
      ...payload,
    },
  };
}

function handleGetSecretaryDoctors() {
  return createSuccessResponse({
    doctors: listDoctors(),
  });
}

function handleGetSecretaryDoctorAvailability() {
  return createSuccessResponse({
    availability: listDoctorAvailability(),
  });
}

function handleGetSecretaryDoctorsOverview() {
  const doctors = listDoctors();
  const availability = listDoctorAvailability();

  const availabilityByDoctorId = new Map(
    availability.map((item) => [item.doctorId, item])
  );

  return createSuccessResponse({
    doctors: doctors.map((doctor) => ({
      ...doctor,
      availability: availabilityByDoctorId.get(doctor.id) || null,
    })),
  });
}

module.exports = {
  handleGetSecretaryDoctorAvailability,
  handleGetSecretaryDoctors,
  handleGetSecretaryDoctorsOverview,
};
