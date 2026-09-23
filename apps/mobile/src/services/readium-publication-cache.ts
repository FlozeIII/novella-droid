import { Directory, File, Paths } from 'expo-file-system';
import { SERVICE_ENDPOINTS, type BookChapter, type NovelChapterContent, type TextConversionMode } from '@novella/api-client';
import {
  inlineNovelFootnotesAfterBlocks,
  normalizeNovelBlocks,
  processNovelFootnotes,
  type NovelFootnoteProcessingResult,
} from '@novella/reader-engine';

import { readerFontFamily, type ReaderBookFont } from './reader-font-loader';
import {
  buildReadiumChapterDocument,
  buildReadiumPublicationResources,
  isReadiumPublicationReady,
  readiumFontHref,
  readiumPublicationCacheKey,
  type ReadiumPublicationChapter,
} from './readium-publication.ts';

const publicationCacheRoot = new Directory(Paths.cache, 'novella-readium-publications');

export interface PrepareReadiumPublicationInput {
  /** Font for the target chapter's payload, written beside its document. */
  bookFont?: ReaderBookFont | null;
  bookId: number;
  bookTitle: string;
  chapters: readonly BookChapter[];
  conversion?: TextConversionMode;
  targetChapter: NovelChapterContent;
}

export interface PreparedReadiumPublication {
  chapter: NovelChapterContent;
  declaredHrefs: readonly string[];
  directoryUri: string;
  footnotes: NovelFootnoteProcessingResult;
  publicationId: string;
  targetHref: string;
}

/**
 * Materializes only the minimum resource set needed for first paint. Future
 * chapters are added with materializeReadiumChapter as preload completes.
 */
export function prepareReadiumPublication({
  bookFont = null,
  bookId,
  bookTitle,
  chapters,
  conversion,
  targetChapter,
}: PrepareReadiumPublicationInput): PreparedReadiumPublication {
  if (targetChapter.bookId !== bookId) {
    throw new Error('The target chapter does not belong to this publication');
  }

  const publicationChapters = toPublicationChapters(chapters);
  const cacheKey = readiumPublicationCacheKey(bookId, conversion);
  const publicationDirectory = new Directory(publicationCacheRoot, cacheKey);
  ensureDirectory(publicationDirectory);

  const resourceSet = buildReadiumPublicationResources(
    {
      bookId,
      identifier: `novella:${bookId}:${conversion ?? 'none'}`,
      title: bookTitle,
    },
    publicationChapters,
    targetChapter.id,
    bookFont ? readiumFontHref(bookFont.revision) : null,
  );

  for (const [href, content] of Object.entries(resourceSet.resources)) {
    writeResource(publicationDirectory, href, content);
  }

  const footnotes = materializeReadiumChapter(publicationDirectory, targetChapter, bookFont);

  const availableHrefs = collectAvailableHrefs(publicationDirectory);
  if (!isReadiumPublicationReady({
    availableHrefs,
    targetChapterId: targetChapter.id,
  })) {
    throw new Error('The publication did not reach the minimum readable state');
  }

  return {
    chapter: targetChapter,
    declaredHrefs: resourceSet.declaredHrefs,
    directoryUri: publicationDirectory.uri,
    footnotes,
    publicationId: cacheKey,
    targetHref: resourceSet.targetChapterHref,
  };
}

/**
 * Adds one chapter without rebuilding or waiting for any image resource.
 *
 * A font is written only for chapters whose payload revision is already known —
 * in practice just the chapter being opened. The file has to be on disk before
 * the document that links to it, hence the write before the document.
 */
export function materializeReadiumChapter(
  publicationDirectory: Directory,
  chapter: NovelChapterContent,
  bookFont: ReaderBookFont | null = null,
): NovelFootnoteProcessingResult {
  const footnotes = processNovelFootnotes(chapter.content, {
    markerContent: 'placeholder',
  });
  const sourceBlocks = normalizeNovelBlocks(footnotes.html, undefined, { sanitize: false });
  const blocks = inlineNovelFootnotesAfterBlocks(sourceBlocks, footnotes.notesById);
  if (bookFont) writeResource(publicationDirectory, bookFont.href, bookFont.bytes);
  const document = buildReadiumChapterDocument({
    blocks,
    bookFont: bookFont
      ? { family: readerFontFamily(bookFont.revision), revision: bookFont.revision }
      : null,
    chapterId: chapter.id,
    imageBaseUrl: SERVICE_ENDPOINTS.apiOrigin,
    title: chapter.title,
  });
  writeResource(
    publicationDirectory,
    `EPUB/chapters/${chapter.id}.xhtml`,
    document,
  );
  return footnotes;
}

export function materializeReadiumPreloadedChapter(
  publicationUri: string,
  chapter: NovelChapterContent,
  bookFont: ReaderBookFont | null = null,
): void {
  materializeReadiumChapter(new Directory(publicationUri), chapter, bookFont);
}

export function clearReadiumPublicationCache(bookId?: number): number {
  if (!publicationCacheRoot.exists) return 0;
  const directories = publicationCacheRoot.list().filter(
    (entry): entry is Directory => entry instanceof Directory,
  );
  const selected = bookId === undefined
    ? directories
    : directories.filter((directory) => directory.name.startsWith(`${bookId}-`));
  for (const directory of selected) directory.delete();
  return selected.length;
}

function toPublicationChapters(chapters: readonly BookChapter[]): ReadiumPublicationChapter[] {
  return chapters.map((chapter, index) => ({
    id: chapter.id,
    sortNum: index + 1,
    title: chapter.title,
  }));
}

/**
 * Writes one publication resource through a temporary file, so a reader that is
 * already looking at the publication never sees a half-written document (or a
 * truncated font, which would decode as broken glyphs).
 */
function writeResource(root: Directory, href: string, content: string | Uint8Array): void {
  const destination = new File(root, href);
  ensureDirectory(destination.parentDirectory);
  const temporary = new File(destination.parentDirectory, `${destination.name}.tmp`);
  if (temporary.exists) temporary.delete();
  temporary.write(content);
  temporary.moveSync(destination, { overwrite: true });
}

function ensureDirectory(directory: Directory): void {
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
}

function collectAvailableHrefs(root: Directory): Set<string> {
  const hrefs = new Set<string>();
  const visit = (directory: Directory, prefix: string) => {
    for (const entry of directory.list()) {
      const href = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry instanceof Directory) visit(entry, href);
      else hrefs.add(href);
    }
  };
  visit(root, '');
  return hrefs;
}
