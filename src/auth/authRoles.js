const AUTH_ROLES = Object.freeze({
  MANAGER: "manager",
  SECRETARY: "secretary",
  DOCTOR: "doctor",
});

const ROLE_VALUES = Object.freeze(Object.values(AUTH_ROLES));

const AUTH_PERMISSIONS = Object.freeze({
  READ_INTERNAL: "read_internal",
  READ_OPERATIONAL: "read_operational",
  MUTATE_REVIEW_DECISION: "mutate_review_decision",
  MUTATE_APPOINTMENT_CREATION: "mutate_appointment_creation",
  MUTATE_CALENDAR_SYNC: "mutate_calendar_sync",
  MUTATE_CONFIRMATION_DISPATCH: "mutate_confirmation_dispatch",
  MUTATE_APPOINTMENT_LIFECYCLE: "mutate_appointment_lifecycle",
  MUTATE_DOCTOR_AVAILABILITY: "mutate_doctor_availability",
  MANAGE_AUTH: "manage_auth",
});

const PERMISSIONS_BY_ROLE = Object.freeze({
  [AUTH_ROLES.MANAGER]: Object.freeze(Object.values(AUTH_PERMISSIONS)),
  [AUTH_ROLES.SECRETARY]: Object.freeze([
    AUTH_PERMISSIONS.READ_INTERNAL,
    AUTH_PERMISSIONS.READ_OPERATIONAL,
    AUTH_PERMISSIONS.MUTATE_REVIEW_DECISION,
    AUTH_PERMISSIONS.MUTATE_APPOINTMENT_CREATION,
    AUTH_PERMISSIONS.MUTATE_CALENDAR_SYNC,
    AUTH_PERMISSIONS.MUTATE_CONFIRMATION_DISPATCH,
    AUTH_PERMISSIONS.MUTATE_APPOINTMENT_LIFECYCLE,
    AUTH_PERMISSIONS.MUTATE_DOCTOR_AVAILABILITY,
  ]),
  [AUTH_ROLES.DOCTOR]: Object.freeze([
    AUTH_PERMISSIONS.READ_INTERNAL,
    AUTH_PERMISSIONS.READ_OPERATIONAL,
  ]),
});

function isValidRole(role) {
  return ROLE_VALUES.includes(String(role || "").trim());
}

function roleHasPermission(role, permission) {
  return (PERMISSIONS_BY_ROLE[role] || []).includes(permission);
}

module.exports = {
  AUTH_PERMISSIONS,
  AUTH_ROLES,
  PERMISSIONS_BY_ROLE,
  isValidRole,
  roleHasPermission,
};
