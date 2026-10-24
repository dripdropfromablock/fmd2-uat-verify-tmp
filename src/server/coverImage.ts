import { timingSafeEqual } from 'node:crypto';
import { IMAGE_PROXY_SIGNATURE_TTL_MS, signImageProxyRequest } from './imageProxySecurity.ts';

const SIGNATURE_TTL_MS = IMAGE_PROXY_SIGNATURE_TTL_MS;

export function buildProxiedImageUrl(targetUrl: string, referer: string): string {
  let normalizedTarget = targetUrl.trim().replace(/&amp;/gi, '&');
  try {
    normalizedTarget = new URL(normalizedTarget, referer).href;
  } catch {
    // Preserve malformed values so the proxy can safely reject them.
  }
  const expiresAt = Date.now() + SIGNATURE_TTL_MS;
  const signature = signImageProxyRequest(normalizedTarget, referer, expiresAt);
  return `/api/proxy/image?url=${encodeURIComponent(normalizedTarget)}&referer=${encodeURIComponent(
    referer
  )}&expires=${expiresAt}&signature=${signature}`;
}

export function buildMangadexCoverUrl(mangaId: string, fileName: string): string {
  return `https://uploads.mangadex.org/covers/${encodeURIComponent(mangaId)}/${encodeURIComponent(fileName)}.256.jpg`;
}

export function extractImageUrlFromHtml(html: string): string | undefined {
  const tags = html.match(/<(?:source|img)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const match = tag.match(/\b(?:src|srcset)=["']([^"']+)["']/i);
    if (!match) continue;
    const candidate = match[1]
      .split(',')[0]
      .trim()
      .split(/\s+/)[0]
      ?.replace(/&amp;/gi, '&');
    if (candidate && !/^(?:data:|about:|javascript:)/i.test(candidate)) return candidate;
  }
  return undefined;
}

export function proxyCoverUrl(rawUrl: string | undefined, referer: string): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl.replace(/&amp;/gi, '&'), referer);
    if (url.protocol !== 'https:') return undefined;
    return buildProxiedImageUrl(url.href, referer);
  } catch {
    return undefined;
  }
}

export function verifyImageProxySignature(
  url: string,
  referer: string,
  expiresAt: number,
  signature: string,
  now = Date.now()
): boolean {
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < now ||
    expiresAt > now + SIGNATURE_TTL_MS ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) return false;
  const expected = Buffer.from(signImageProxyRequest(url, referer, expiresAt));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
