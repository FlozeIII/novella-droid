import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeNovelBlocks, processNovelFootnotes } from '@novella/reader-engine';

import { createReadiumReaderPreferences, opaqueCssColor } from './readium-preferences.ts';
import {
  buildReadiumChapterDocument,
  buildReadiumPublicationResources,
  isReadiumPublicationReady,
  readiumBlockFragment,
  readiumChapterHref,
  readiumFontHref,
  readiumFontPublicationHref,
  readiumPublicationCacheKey,
} from './readium-publication.ts';

const chapters = [
  { id: 101, sortNum: 1, title: 'First & One' },
  { id: 205, sortNum: 2, title: 'Second' },
];

const blocks = [
  { id: 'block://p[1]', locator: '//p[1]', html: '<p>First block</p>', textLength: 11, imageCount: 0 },
  { id: 'block://p[2]', locator: '//p[2]', html: '<p id="server-id">Second block</p>', textLength: 12, imageCount: 0 },
];

test('publication metadata declares a complete stable spine without chapter payloads', () => {
  const publication = buildReadiumPublicationResources(
    { bookId: 9, identifier: 'novella:9', title: 'Book' },
    chapters,
    205,
  );

  const opf = publication.resources['EPUB/package.opf'];
  assert.ok(opf);
  assert.match(opf, /href="chapters\/101\.xhtml"/);
  assert.match(opf, /href="chapters\/205\.xhtml"/);
  // A font is a file per chapter payload, and only the target's revision is known
  // when the publication is built, so no font may be declared without one.
  assert.doesNotMatch(opf, /font\/woff2/);
  assert.equal(publication.targetChapterHref, 'chapters/205.xhtml');
  assert.equal(publication.resources['EPUB/chapters/101.xhtml'], undefined);
  assert.ok(publication.declaredHrefs.includes('EPUB/chapters/101.xhtml'));
  assert.ok(publication.declaredHrefs.includes('EPUB/chapters/205.xhtml'));
  assert.ok(!publication.declaredHrefs.some((href) => href.endsWith('.woff2')));
});

test('the target chapter font is declared to the container and the manifest', () => {
  const publication = buildReadiumPublicationResources(
    { bookId: 9, identifier: 'novella:9', title: 'Book' },
    chapters,
    205,
    readiumFontHref('205-def'),
  );

  const opf = publication.resources['EPUB/package.opf'];
  assert.match(opf, /<item id="book-font" href="fonts\/205-def\.woff2" media-type="font\/woff2"\/>/);
  // Readium's DirectoryContainer serves only the hrefs declared when it opened.
  assert.ok(publication.declaredHrefs.includes(readiumFontPublicationHref('205-def')));
});

test('chapter XHTML receives deterministic fragments and links its own font file', () => {
  const html = buildReadiumChapterDocument({
    blocks,
    bookFont: { family: 'NovellaBookFont_101-abc', revision: '101-abc' },
    chapterId: 101,
    title: 'First',
  });

  assert.match(html, /<body class="nv-book-font" data-chapter-id="101">/);
  assert.match(html, /<p id="nv-block-0">First block<\/p>/);
  assert.match(html, /<p id="nv-block-1">Second block<\/p>/);
  assert.match(html, /href="\.\.\/styles\/reader\.css"/);
  // The document lives in EPUB/chapters/, so it links ../fonts/<revision>.woff2 and
  // never carries the bytes itself.
  assert.ok(html.includes(`src:url("../${readiumFontHref('101-abc')}") format('woff2')`));
  assert.equal(`EPUB/${readiumFontHref('101-abc')}`, readiumFontPublicationHref('101-abc'));
  assert.doesNotMatch(html, /data:font\/woff2/);
  assert.match(html, /body\.nv-book-font\{font-family:'NovellaBookFont_101-abc',sans-serif;\}/);
  assert.doesNotMatch(html, /nv-reader-image-interaction/);
  assert.match(html, /e\.stopImmediatePropagation\(\);send\(i,'tap'\)/);
  assert.match(html, /window\.webkit\.messageHandlers\.novellaReader\.postMessage\(p\)/);
  assert.match(html, /classList\.contains\('no-preview'\).*classList\.contains\('footnote'\)/);
  assert.doesNotMatch(html, /preventDefault\(\)/);
});

test('a chapter without its own font carries no font face and no font class', () => {
  const html = buildReadiumChapterDocument({
    blocks,
    chapterId: 101,
    title: 'Plain',
  });

  assert.match(html, /<body data-chapter-id="101">/);
  assert.doesNotMatch(html, /@font-face/);
  assert.doesNotMatch(html, /nv-book-font/);
  assert.doesNotMatch(html, /data:font\/woff2/);
  assert.doesNotMatch(html, /\.woff2/);
});

test('adds browser line-break opportunities around private-use font glyphs', () => {
  const privateUse = String.fromCodePoint(0xE001);
  const html = buildReadiumChapterDocument({
    blocks: [{
      id: 'pua',
      locator: '//p[1]',
      html: `<p>甲${privateUse}乙${privateUse}${privateUse}丙</p>`,
      textLength: 6,
      imageCount: 0,
    }],
    chapterId: 101,
    title: 'PUA',
  });

  assert.match(html, /&#x7532;&#x200B;&#xE001;&#x200B;&#x4E59;&#x200B;&#xE001;&#x200B;&#xE001;&#x200B;&#x4E19;/);
});

test('adds break opportunities between adjacent ruby runs', () => {
  const html = buildReadiumChapterDocument({
    blocks: [{
      id: 'ruby',
      locator: '//p[1]',
      html: '<p><ruby>粹<rt>•</rt></ruby><ruby>伏<rt>•</rt></ruby><ruby>的<rt>•</rt></ruby></p>',
      textLength: 3,
      imageCount: 0,
    }],
    chapterId: 101,
    title: 'Ruby',
  });

  assert.ok(html.includes('</ruby>&#x200B;<ruby>'));
});

test('maps legacy heading classes to Readium semantic headings without absorbing following blocks', () => {
  const html = buildReadiumChapterDocument({
    blocks: [
      { id: 'h1', locator: '//p[1]', html: '<p class="pius1">Heading</p>', textLength: 7, imageCount: 0 },
      { id: 'h2', locator: '//div[1]', html: '<div class="pius2">Subheading</div>', textLength: 10, imageCount: 0 },
      { id: 'h4', locator: '//p[2]', html: '<p class="ph4">Subheading 4</p>', textLength: 12, imageCount: 0 },
      { id: 'body', locator: '//p[3]', html: '<p>Body remains normal</p>', textLength: 18, imageCount: 0 },
    ],
    chapterId: 101,
    title: 'Heading',
  });

  assert.match(html, /<h1 class="pius1" id="nv-block-0">Heading<\/h1>/);
  assert.match(html, /<h2 class="pius2" id="nv-block-1">Subheading<\/h2>/);
  assert.match(html, /<h4 class="ph4" id="nv-block-2">Subheading 4<\/h4>/);
  assert.match(html, /<\/h4>\s*<p id="nv-block-3">Body remains normal<\/p>/);
});

test('image tables retain their authored rows and columns', () => {
  const row = (start) => '<tr>' + Array.from(
    { length: 4 },
    (_, index) => `<td><img src="images/${start + index}.png"></td>`,
  ).join('') + '</tr>';
  const html = buildReadiumChapterDocument({
    blocks: [{
      id: 'screens',
      locator: '//*/table[1]',
      html: `<table><thead><tr><th></th><th></th><th></th><th></th></tr></thead><tbody>${row(1)}${row(5)}</tbody></table>`,
      textLength: 0,
      imageCount: 8,
    }],
    chapterId: 101,
    imageBaseUrl: 'https://example.test',
    title: 'Screens',
  });
  const publication = buildReadiumPublicationResources(
    { bookId: 9, identifier: 'novella:9', title: 'Book' },
    chapters,
    101,
  );

  assert.match(html, /<table id="nv-block-0"><thead>/);
  assert.equal((html.match(/<tr>/gu) ?? []).length, 3);
  assert.equal((html.match(/<td>/gu) ?? []).length, 8);
  assert.equal((html.match(/<img\b/gu) ?? []).length, 8);
  assert.match(publication.resources['EPUB/styles/reader.css'], /table\{width:100%;max-width:100%;table-layout:fixed/);
  assert.match(publication.resources['EPUB/styles/reader.css'], /body>:last-child\{margin-bottom:0!important;\}/);
  assert.match(publication.resources['EPUB/styles/reader.css'], /body>p\{text-indent:var\(--USER__paraIndent\)!important;\}/);
  assert.match(publication.resources['EPUB/styles/reader.css'], /\.nv-inline-footnote-content>li\{display:block;list-style:none;margin:0;padding:0;\}/);
  assert.match(publication.resources['EPUB/styles/reader.css'], /html\[style\*="readium-scroll-on"\],html\[style\*="readium-scroll-on"\] body\{overflow-x:hidden!important;\}/);
  assert.match(publication.resources['EPUB/styles/reader.css'], /-webkit-user-select:none;user-select:none/);
  assert.match(publication.resources['EPUB/styles/reader.css'], /img\{max-width:100%;height:auto;border-radius:4px;\}/);
  assert.match(publication.resources['EPUB/styles/reader.css'], /ruby\{white-space:normal;word-break:break-all;overflow-wrap:anywhere;\}/);
  assert.match(publication.resources['EPUB/styles/reader.css'], /ruby rt\{font-size:\.5em;white-space:normal;word-break:break-all;overflow-wrap:anywhere;\}/);
});

test('chapter HTML is normalized with inline footnotes', () => {
  const html = buildReadiumChapterDocument({
    blocks: [
      { id: 'image', locator: '//div[1]', html: '<div><img src="images/a.jpg?x=1&y=2"></div>', textLength: 0, imageCount: 1 },
      { id: 'break', locator: '//p[1]', html: '<p><br></p>', textLength: 0, imageCount: 0 },
      { id: 'note', locator: '//p[2]', html: '<p>：<a data-reader-footnote-id="n1" href="#old" epub:type="noteref"><sup><img class="footnote" src="marker.png" /></sup></a></p>', textLength: 1, imageCount: 1 },
    ],
    chapterId: 101,
    footnotes: { n1: '<p>Note<br>body</p>' },
    imageBaseUrl: 'https://example.test',
    title: 'First',
  });

  assert.match(html, /xmlns:epub="http:\/\/www\.idpf\.org\/2007\/ops"/);
  assert.match(html, /<img src="https:\/\/example\.test\/images\/a\.jpg\?x=1&amp;y=2"\/>/);
  assert.match(html, /<br\/>/);
  assert.doesNotMatch(html, /epub:type="noteref"|marker\.png|data-reader-footnote-id|>\*<\/a>/);
  assert.doesNotMatch(html, /nv-block-2|&#xFF1A;/);
  assert.match(html, /<aside class="nv-inline-footnote" data-footnote-id="n1"><span class="nv-inline-footnote-label">\*<\/span>/);
  assert.match(html, /<div class="nv-inline-footnote-content"><p>Note<br\/>body<\/p><\/div>/);
  const scriptIndex = html.indexOf('<script type="text/javascript">');
  const headEndIndex = html.indexOf('</head>');
  const bodyStartIndex = html.indexOf('<body');
  assert.ok(scriptIndex > 0 && scriptIndex < headEndIndex);
  assert.ok(headEndIndex < bodyStartIndex);
  assert.doesNotMatch(html.slice(bodyStartIndex), /<script\b/);
});

test('non-anchor Web-Master notes replace marker images and render after their paragraph', () => {
  const processed = processNovelFootnotes(
    '<p>正文<sup class="duokan-footnote" href="#n2"><img class="footnote" src="marker.png"></sup>段末。</p>' +
      '<ol id="n2"><li>注释：原文 QOL</li></ol>' +
      '<p>下一段。</p>' +
      '<div><img class="illustration" src="ordinary.png" alt="ordinary"></div>',
    { markerContent: 'placeholder' },
  );
  const html = buildReadiumChapterDocument({
    blocks: normalizeNovelBlocks(processed.html, undefined, { sanitize: false }),
    chapterId: 101,
    footnotes: processed.notesById,
    imageBaseUrl: 'https://example.test',
    title: 'First',
  });

  const paragraphIndex = html.indexOf('id="nv-block-0"');
  const noteIndex = html.indexOf('<aside class="nv-inline-footnote"');
  const nextParagraphIndex = html.indexOf('id="nv-block-1"');
  assert.ok(paragraphIndex >= 0 && paragraphIndex < noteIndex && noteIndex < nextParagraphIndex);
  assert.match(html, /id="nv-block-0">[\s\S]*?<span class="nv-inline-footnote-marker">\*<\/span>/);
  assert.match(html, /<span class="nv-inline-footnote-label">\*<\/span>/);
  assert.match(html, /<div class="nv-inline-footnote-content"><li>[^<]*QOL<\/li><\/div>/);
  assert.match(html, /<img class="illustration" src="https:\/\/example\.test\/ordinary\.png" alt="ordinary"\/>/);
  assert.doesNotMatch(html, /marker\.png|duokan-footnote|<ol id="n2"/);
});

test('readiness gates the target chapter but not future chapters or images', () => {
  const available = new Set([
    'mimetype',
    'META-INF/container.xml',
    'EPUB/package.opf',
    'EPUB/nav.xhtml',
    'EPUB/styles/reader.css',
    'EPUB/chapters/101.xhtml',
  ]);

  assert.equal(isReadiumPublicationReady({
    availableHrefs: available,
    targetChapterId: 101,
  }), true);

  available.delete('EPUB/chapters/101.xhtml');
  assert.equal(isReadiumPublicationReady({
    availableHrefs: available,
    targetChapterId: 101,
  }), false);
  assert.equal(isReadiumPublicationReady({
    availableHrefs: available,
    targetChapterId: 205,
  }), false);
});

test('reader colors cross the native bridge as opaque RGB hex', () => {
  assert.equal(opaqueCssColor('#1D1B20FF'), '#1D1B20');
  assert.equal(opaqueCssColor('#ABC8'), '#AABBCC');
  assert.equal(opaqueCssColor('#F2F2F7'), '#F2F2F7');
  assert.equal(opaqueCssColor('black'), 'black');

  const preferences = createReadiumReaderPreferences({
    backgroundColor: '#FFFBFEFF',
    firstLineIndent: false,
    fontSize: 16,
    imagePreviewOpenOnLongPress: false,
    lineHeight: 1.6,
    mode: 'paged',
    sidePadding: 30,
    textColor: '#1D1B20FF',
  });
  assert.equal(preferences.backgroundColor, '#FFFBFE');
  assert.equal(preferences.textColor, '#1D1B20');
  assert.equal(preferences.doublePage, false);
  assert.equal(preferences.paragraphSpacing, 0);
  assert.equal(preferences.pagedTapNavigation, true);
});

test('reader preferences map first-line indentation to Readium rem units', () => {
  const base = {
    backgroundColor: '#ffffff',
    fontSize: 18,
    imagePreviewOpenOnLongPress: false,
    lineHeight: 1.6,
    mode: 'paged',
    sidePadding: 30,
    textColor: '#000000',
  };
  assert.equal(createReadiumReaderPreferences({ ...base, firstLineIndent: true }).paragraphIndent, 2);
  assert.equal(createReadiumReaderPreferences({ ...base, firstLineIndent: false }).paragraphIndent, 0);
  assert.equal(createReadiumReaderPreferences({
    ...base,
    doublePage: true,
    paragraphSpacing: 16,
  }).doublePage, true);
  assert.equal(createReadiumReaderPreferences({
    ...base,
    fontSize: 16,
    paragraphSpacing: 16,
  }).paragraphSpacing, 1);
});

test('publication cache identity includes the conversion mode', () => {
  assert.equal(readiumPublicationCacheKey(9, undefined), '9-none');
  assert.equal(readiumPublicationCacheKey(9, 't2s'), '9-t2s');
  assert.equal(readiumBlockFragment(3), 'nv-block-3');
  assert.equal(readiumChapterHref(205), 'EPUB/chapters/205.xhtml');
});
