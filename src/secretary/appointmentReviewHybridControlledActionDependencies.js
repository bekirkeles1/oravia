const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("./appointmentReviewMockControlledActionDependencies");
const {
  createAppointmentReviewRepositoryContextResolver,
} = require("./appointmentReviewRepositoryContextResolver");

function createHybridAppointmentReviewControlledActionDependencies(options) {
  const mockDependencies = createMockAppointmentReviewControlledActionDependencies();
  const resolveAppointmentReviewContext =
    createAppointmentReviewRepositoryContextResolver(options);

  return Object.freeze({
    resolveVerifiedActorContext: mockDependencies.resolveVerifiedActorContext,
    resolveAppointmentReviewContext,
    resolveIdempotencyContext: mockDependencies.resolveIdempotencyContext,
    resolveExecutionPolicyContext:
      mockDependencies.resolveExecutionPolicyContext,
  });
}

module.exports = {
  createHybridAppointmentReviewControlledActionDependencies,
};
