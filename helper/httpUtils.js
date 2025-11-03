const fetchWithTimeout = async (url, options = {}) => {
  const { timeout = 5000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(`[HttpUtils] Aborting request to ${url} after ${timeout}ms timeout`);
    controller.abort();
  }, timeout);

  try {
    console.log(`[HttpUtils] Fetching ${url} with timeout ${timeout}ms`);
    const startTime = Date.now();
    
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const fetchTime = Date.now() - startTime;
    console.log(`[HttpUtils] Fetch completed for ${url} in ${fetchTime}ms - Status: ${response.status}`);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    const fetchTime = Date.now() - startTime;
    
    if (error.name === 'AbortError') {
      console.error(`[HttpUtils] Request aborted (timeout after ${timeout}ms) for ${url} - Actual time: ${fetchTime}ms`);
      throw error;
    }
    
    console.error(`[HttpUtils] Fetch error for ${url} after ${fetchTime}ms:`, error.message);
    throw error;
  }
};

const buildServiceBaseUrls = (envUrl, fallbacks = []) => {
  const urls = [];
  
  // Primäre URL aus Umgebungsvariable
  if (envUrl) {
    const trimmed = envUrl.trim();
    if (trimmed) {
      // Unterstützung für mehrere URLs getrennt durch Komma oder Semikolon
      const splitUrls = trimmed.split(/[,;]/).map(u => u.trim()).filter(Boolean);
      urls.push(...splitUrls);
      console.log(`[HttpUtils] Loaded ${splitUrls.length} URL(s) from environment variable: ${splitUrls.join(', ')}`);
    }
  }
  
  // Fallback URLs hinzufügen
  if (fallbacks && fallbacks.length > 0) {
    urls.push(...fallbacks);
    console.log(`[HttpUtils] Added ${fallbacks.length} fallback URL(s): ${fallbacks.join(', ')}`);
  }
  
  // Deduplizierung
  const uniqueUrls = [...new Set(urls)];
  
  if (uniqueUrls.length === 0) {
    console.warn('[HttpUtils] ⚠️ WARNING: No service URLs configured!');
  } else {
    console.log(`[HttpUtils] Total unique URLs configured: ${uniqueUrls.length}`);
  }
  
  return uniqueUrls;
};

module.exports = {
  fetchWithTimeout,
  buildServiceBaseUrls,
};
