/**
 * Destination-URL liveness check for Setup Auditor. Neither Google Ads nor
 * Meta's API tells you whether a campaign's destination URL actually
 * resolves — this is the first place in the codebase that fetches an
 * arbitrary, campaign-supplied URL from our servers, so it's hardened
 * against SSRF:
 *  - only http/https, resolved via DNS before connecting
 *  - refuses to connect if any resolved address is private/loopback/
 *    link-local/reserved (including IPv4-mapped IPv6 forms)
 *  - connects directly to the IP we validated (Host header + TLS SNI set to
 *    the original hostname) so a DNS answer can't change between the check
 *    and the connection (DNS-rebinding)
 *  - each redirect hop re-validates the same way, capped at 3 hops
 *  - hard timeout, and the response body is never read (HEAD, or GET with
 *    the socket destroyed as soon as headers arrive) so a malicious
 *    endpoint can't stall the connection or stream unbounded data at us
 */

import * as http from 'http';
import * as https from 'https';
import * as dns from 'dns';
import * as net from 'net';

const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;

export interface UrlLivenessResult {
  url: string;
  live: boolean;
  statusCode: number | null;
  error: string | null;
}

function isPrivateOrReservedIP(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
    if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true; // multicast + reserved (224.0.0.0/4 and 240.0.0.0/4)
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true; // link-local / unique-local
    // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1 — unwrap and re-check as IPv4
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateOrReservedIP(mapped[1]);
    return false;
  }
  return true; // unrecognised — refuse rather than risk it
}

async function resolveAndValidate(hostname: string): Promise<string> {
  const addresses = await dns.promises.lookup(hostname, { all: true });
  if (addresses.length === 0) throw new Error('DNS resolution returned no addresses');
  for (const { address } of addresses) {
    if (isPrivateOrReservedIP(address)) {
      throw new Error(`Refusing to connect to private/reserved address (${address})`);
    }
  }
  return addresses[0].address;
}

function requestOnce(targetUrl: URL, resolvedIp: string): Promise<{ statusCode: number; location: string | null }> {
  return new Promise((resolve, reject) => {
    const isHttps = targetUrl.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request(
      {
        host: resolvedIp,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: 'HEAD',
        headers: { Host: targetUrl.hostname, 'User-Agent': 'PlanPulse-SetupAuditor/1.0' },
        timeout: TIMEOUT_MS,
        ...(isHttps ? { servername: targetUrl.hostname } : {}),
      },
      (res) => {
        res.destroy(); // never read the body
        resolve({ statusCode: res.statusCode ?? 0, location: res.headers.location ?? null });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end();
  });
}

/** GET fallback for servers that reject HEAD (405/501) — still never reads the body. */
function requestOnceGet(targetUrl: URL, resolvedIp: string): Promise<{ statusCode: number; location: string | null }> {
  return new Promise((resolve, reject) => {
    const isHttps = targetUrl.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request(
      {
        host: resolvedIp,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: 'GET',
        headers: { Host: targetUrl.hostname, 'User-Agent': 'PlanPulse-SetupAuditor/1.0' },
        timeout: TIMEOUT_MS,
        ...(isHttps ? { servername: targetUrl.hostname } : {}),
      },
      (res) => {
        res.destroy();
        resolve({ statusCode: res.statusCode ?? 0, location: res.headers.location ?? null });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end();
  });
}

export async function checkUrlLiveness(rawUrl: string): Promise<UrlLivenessResult> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { url: rawUrl, live: false, statusCode: null, error: 'Malformed URL' };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      return { url: rawUrl, live: false, statusCode: null, error: `Unsupported protocol: ${current.protocol}` };
    }

    let resolvedIp: string;
    try {
      resolvedIp = await resolveAndValidate(current.hostname);
    } catch (e: any) {
      return { url: rawUrl, live: false, statusCode: null, error: e.message };
    }

    try {
      let { statusCode, location } = await requestOnce(current, resolvedIp);
      if (statusCode === 405 || statusCode === 501) {
        ({ statusCode, location } = await requestOnceGet(current, resolvedIp));
      }

      if (statusCode >= 300 && statusCode < 400 && location) {
        current = new URL(location, current);
        continue;
      }

      return { url: rawUrl, live: statusCode >= 200 && statusCode < 400, statusCode, error: null };
    } catch (e: any) {
      return { url: rawUrl, live: false, statusCode: null, error: e.message };
    }
  }

  return { url: rawUrl, live: false, statusCode: null, error: 'Too many redirects' };
}
