/** Stable spine href used by the Readium publication and locator bridge. */
export function chapterHrefFor(chapterId: number): string {
  return `chapters/${chapterId}.xhtml`;
}
