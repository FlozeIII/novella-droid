import * as FileSystem from 'expo-file-system';

import { SERVICE_ENDPOINTS } from '@novella/api-client';

import { readiumFontPublicationHref } from './readium-publication.ts';

/** One chapter's book font, ready to be written beside its chapter document. */
export interface ReaderBookFont {
  bytes: Uint8Array;
  /** Publication-relative path the bytes are written to and served from. */
  href: string;
  revision: string;
}

/** Revision keys already fetched in this session, oldest first. */
const readerFontCache = new Map<string, Promise<Uint8Array>>();
/**
 * Each entry is a ~1MB WOFF2 held on the JS heap, and only the chapter being read
 * plus its preloaded neighbours are ever asked for, so the cache is capped rather
 * than growing by one chapter for every chapter opened.
 */
const READER_FONT_CACHE_LIMIT = 4;
/**
 * A book font is ~1MB, so a mobile connection can stall mid-download: abort and
 * retry rather than let a truncated WOFF2 reach the renderer as broken glyphs.
 */
const FONT_DOWNLOAD_TIMEOUT_MS = 60_000;
const FONT_DOWNLOAD_ATTEMPTS = 2;
/** Directory used by the removed on-disk font cache; still cleaned up on demand. */
const READER_FONT_CACHE_DIRECTORY = 'novella-reader-fonts';

/**
 * Cache identity for one chapter payload.
 *
 * The backend rescrambles a chapter's text on every request and issues the
 * matching font at a URL that stays the same for a whole book, so the URL alone
 * cannot tell which scramble a cached font decodes. The payload can: hashing it
 * pins exactly one font to exactly the glyphs it was served with.
 */
export function readerFontRevisionKey(chapterId: number, content: string): string {
  return `${chapterId}-${hashString(content)}`;
}

export function readerFontFamily(revision: string): string {
  return `NovellaBookFont_${revision}`;
}

export function resolveReaderFontUrl(fontUrl: string | null | undefined): string | null {
  if (!fontUrl || !fontUrl.trim()) return null;
  const value = fontUrl.trim();
  return value.startsWith('http://') || value.startsWith('https://')
    ? value
    : `${SERVICE_ENDPOINTS.apiOrigin}${value.startsWith('/') ? value : `/${value}`}`;
}

/**
 * Downloads the book font (WOFF2) for one chapter payload.
 *
 * The font is written to a file whose name carries the payload's revision, never
 * inlined into the chapter document: a ~1.4MB document kept the first paint blank
 * for the better part of a minute on device, while the same chapter without an
 * inlined font paints in seconds. The per-revision name is what keeps a WebView
 * from reusing a font decoded for a different scramble — the bug a single shared
 * font href produced.
 */
export async function loadReaderBookFont({
  chapterId,
  content,
  fontUrl,
}: {
  chapterId: number;
  content: string;
  fontUrl: string;
}): Promise<ReaderBookFont> {
  const revision = readerFontRevisionKey(chapterId, content);
  return {
    bytes: await loadReaderFontBytes(fontUrl, revision),
    href: readiumFontPublicationHref(revision),
    revision,
  };
}

/** Drops every in-memory font and any file left by the previous disk cache. */
export function clearReaderFontCache(): number {
  readerFontCache.clear();
  const legacyDirectory = new FileSystem.Directory(FileSystem.Paths.cache, READER_FONT_CACHE_DIRECTORY);
  if (!legacyDirectory.exists) return 0;
  const entryCount = legacyDirectory.list().length;
  legacyDirectory.delete();
  return entryCount;
}

function loadReaderFontBytes(fontUrl: string, revision: string): Promise<Uint8Array> {
  const cached = readerFontCache.get(revision);
  if (cached) return cached;

  const pending = downloadReaderFont(fontUrl, revision).catch((error: unknown) => {
    readerFontCache.delete(revision);
    throw error;
  });
  readerFontCache.set(revision, pending);
  while (readerFontCache.size > READER_FONT_CACHE_LIMIT) {
    const oldest = readerFontCache.keys().next().value;
    if (oldest === undefined || oldest === revision) break;
    readerFontCache.delete(oldest);
  }
  return pending;
}

async function downloadReaderFont(fontUrl: string, revision: string): Promise<Uint8Array> {
  const resolved = resolveReaderFontUrl(fontUrl);
  if (!resolved) throw new Error('The chapter does not reference a book font');

  let lastError: unknown = null;
  for (let attempt = 0; attempt < FONT_DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      return await fetchReaderFontBytes(resolved);
    } catch (error) {
      lastError = error;
    }
  }
  console.log('[novella-reader-font] download failed', revision, lastError);
  throw lastError instanceof Error
    ? lastError
    : new Error('The book font could not be downloaded');
}

async function fetchReaderFontBytes(url: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FONT_DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`The book font request failed (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const declared = declaredContentLength(response);
    console.log('[novella-reader-font] fetched', bytes.byteLength, 'declared', declared ?? 'unknown');
    if (declared !== null && declared !== bytes.byteLength) {
      throw new Error('The book font download was truncated');
    }
    if (!isWoff2Bytes(bytes)) {
      throw new Error('Reader font is not a complete WOFF2 file');
    }
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

function declaredContentLength(response: Response): number | null {
  const header = response.headers.get('content-length');
  if (!header) return null;
  const value = Number.parseInt(header, 10);
  return Number.isFinite(value) ? value : null;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

/**
 * A WOFF2 header is big-endian and starts with `wOF2`, the total file length and
 * the table count. Checking the declared length rejects truncated downloads,
 * which would otherwise decode as a font and leave a chapter without glyphs.
 */
function isWoff2Bytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 48 || readUint32(bytes, 0) !== 0x774f4632) return false;
  const declaredLength = readUint32(bytes, 8);
  return declaredLength === 0 || declaredLength === bytes.byteLength;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
