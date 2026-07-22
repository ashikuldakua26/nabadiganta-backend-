function isValidPin(pin) {
  return /^\d{4}$/.test(String(pin || ""));
}

function normalizePhone(phone) {
  const digitsOnly = String(phone || "").replace(/\D+/g, "").trim();

  if (digitsOnly.startsWith("8801") && digitsOnly.length === 13) {
    return `0${digitsOnly.slice(3)}`;
  }

  if (digitsOnly.startsWith("008801") && digitsOnly.length === 15) {
    return `0${digitsOnly.slice(5)}`;
  }

  return digitsOnly;
}

function isPositiveAmount(amount) {
  const parsed = Number(amount);
  return Number.isFinite(parsed) && parsed > 0;
}

function getPagination(query = {}, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

module.exports = {
  isValidPin,
  normalizePhone,
  isPositiveAmount,
  getPagination,
};
