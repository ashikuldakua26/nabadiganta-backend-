const store = new Map();

function setCache(key, value, ttlSec = 60) {
  const expiresAt = Date.now() + Math.max(1000, ttlSec * 1000);
  store.set(key, { value, expiresAt });
}

function getCache(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function clearCache(key) {
  if (key) store.delete(key);
  else store.clear();
}

module.exports = { setCache, getCache, clearCache };
