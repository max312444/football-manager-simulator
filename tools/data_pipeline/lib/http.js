// 캐시·재시도·요청 간격을 갖춘 JSON 요청
// - 같은 URL은 캐시 유효 기간 동안 다시 요청하지 않는다
// - 429 / 5xx / 네트워크 오류 / 잘린 JSON 은 지수 백오프로 재시도, 그 외 4xx는 바로 실패
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CACHE_DIR, USER_AGENT, PROVIDERS, MAX_RETRIES } = require('../config');

const stats = { requests: 0, cacheHits: 0, retries: 0, failures: 0 };
const lastRequestAt = {};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function throttle(provider) {
  const min = PROVIDERS[provider]?.minIntervalMs ?? 1000;
  const wait = (lastRequestAt[provider] ?? 0) + min - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt[provider] = Date.now();
}

function cacheFile(provider, key) {
  const h = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(CACHE_DIR, provider, h.slice(0, 2), `${h}.json`);
}

async function getJson(provider, url, { force = false, accept = 'application/json' } = {}) {
  const file = cacheFile(provider, url);
  const ttlMs = (PROVIDERS[provider]?.ttlDays ?? 30) * 864e5;
  if (!force && fs.existsSync(file)) {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - Date.parse(cached.retrievedAt) < ttlMs) {
      stats.cacheHits++;
      return cached.body;
    }
  }

  for (let attempt = 0; ; attempt++) {
    await throttle(provider);
    stats.requests++;
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, signal: AbortSignal.timeout(90_000) });
    } catch (e) {
      if (attempt >= MAX_RETRIES) { stats.failures++; throw new Error(`네트워크 오류 (${e.message}): ${url}`); }
      stats.retries++;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.ok) {
      // 200인데 본문이 중간에 잘린 경우 (SPARQL 시간 초과 등) → 한 번만 재시도 (같은 질의는 보통 또 잘린다)
      let body;
      try { body = JSON.parse(await res.text()); } catch (e) {
        if (attempt >= 1) { stats.failures++; throw new Error(`잘린 응답 (${e.message}): ${url.slice(0, 200)}`); }
        stats.retries++;
        await sleep(backoff(attempt));
        continue;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ provider, url, retrievedAt: new Date().toISOString(), status: res.status, body }));
      return body;
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      stats.failures++;
      throw new Error(`HTTP ${res.status}: ${url.slice(0, 200)}`);
    }
    stats.retries++;
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
  }
}

const backoff = (attempt) => Math.min(60_000, 2000 * 2 ** attempt) + Math.random() * 500;

module.exports = { getJson, stats };
