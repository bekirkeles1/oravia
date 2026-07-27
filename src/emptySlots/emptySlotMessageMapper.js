function mapEmptySlotOfferTemplateParameters({
  opportunity,
  appointment,
  expiresAt,
  clinicDisplayName = "Oravia",
} = {}) {
  const doctorName = normalizeText(appointment?.doctor?.name || appointment?.doctorName);
  const offeredStartAt = normalizeText(opportunity?.slotStartAt);
  const currentStartAt = normalizeText(appointment?.startAt);
  const expiration = normalizeText(expiresAt);

  if (!doctorName || !offeredStartAt || !currentStartAt || !expiration) {
    return reject("invalid_empty_slot_offer_template_input");
  }

  return freezeClone({
    accepted: true,
    messageKind: "empty_slot_offer_template_parameters_v1",
    parameters: [
      normalizeText(clinicDisplayName) || "Oravia",
      doctorName,
      offeredStartAt.slice(0, 10),
      offeredStartAt.slice(11, 16),
      currentStartAt.slice(0, 10),
      currentStartAt.slice(11, 16),
      expiration.slice(11, 16),
    ],
  });
}

function buildEmptySlotOfferMessage(input = {}) {
  const mapped = mapEmptySlotOfferTemplateParameters(input);
  if (!mapped.accepted) return mapped;
  return freezeClone({
    accepted: true,
    messageKind: "empty_slot_offer_message_v1",
    text:
      "Daha erken randevu teklifi istege baglidir; kabul basarili olana kadar mevcut randevunuz degismez. Slot baska hastaya atanabilir. Kabul veya red secenegiyle yanitlayabilirsiniz.",
    templateParameters: mapped.parameters,
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function reject(code) {
  return freezeClone({
    accepted: false,
    code,
    reason: "Empty-slot offer message mapping failed safely.",
  });
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  buildEmptySlotOfferMessage,
  mapEmptySlotOfferTemplateParameters,
};
