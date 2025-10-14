const fetchWithTimeout = async (resource, options = {}) => {
  const { timeout = 15000, ...rest } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(resource, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildServiceBaseUrls = (primary, defaults = []) => {
  const candidates = [];

  const addCandidate = (value) => {
    if (!value) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    if (!candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  };

  if (primary) {
    primary
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach(addCandidate);
  }

  defaults.forEach(addCandidate);

  return candidates;
};

module.exports = {
  fetchWithTimeout,
  buildServiceBaseUrls,
};
