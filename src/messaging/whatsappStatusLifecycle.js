const STATUS_RANK = Object.freeze({
  accepted: 10,
  sent: 20,
  delivered: 30,
  read: 40,
  failed: 15,
});

function normalizeWhatsAppStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return Object.hasOwn(STATUS_RANK, status) ? status : "";
}

function canAdvanceStatus(currentStatus, nextStatus) {
  const current = normalizeWhatsAppStatus(currentStatus) || "accepted";
  const next = normalizeWhatsAppStatus(nextStatus);

  if (!next) {
    return false;
  }

  if (current === next) {
    return true;
  }

  if (next === "failed" && STATUS_RANK[current] >= STATUS_RANK.delivered) {
    return false;
  }

  return STATUS_RANK[next] >= STATUS_RANK[current];
}

function getStatusRank(status) {
  return STATUS_RANK[normalizeWhatsAppStatus(status)] || 0;
}

module.exports = {
  STATUS_RANK,
  canAdvanceStatus,
  getStatusRank,
  normalizeWhatsAppStatus,
};
