import { useEffect, useState } from 'react';

import { loadReaderBookFont, type ReaderBookFont } from '@/services/reader-font-loader';

/**
 * Loads the optional book font for one chapter payload.
 *
 * The backend rescrambles a chapter on every request, so the font is fetched for
 * that exact payload and materialized as a file beside its document. A failed
 * download intentionally gates the chapter: encoded text would otherwise render
 * as the wrong glyphs.
 */
export type ReaderFontState =
  | { status: 'idle'; font: null; error: undefined }
  | { status: 'loading'; font: null; error: undefined }
  | { status: 'loaded'; font: ReaderBookFont; error: undefined }
  | { status: 'error'; font: null; error: string };

const IDLE_STATE: ReaderFontState = { status: 'idle', font: null, error: undefined };

export interface ReaderFontChapter {
  content: string;
  fontUrl: string | null;
  id: number;
}

export function useReaderFont(
  chapter: ReaderFontChapter | null | undefined,
): ReaderFontState & { retry: () => void } {
  const [state, setState] = useState<ReaderFontState>(IDLE_STATE);
  const [attempt, setAttempt] = useState(0);

  const chapterId = chapter?.id ?? null;
  const content = chapter?.content ?? '';
  const fontUrl = chapter?.fontUrl?.trim() ?? '';

  useEffect(() => {
    let cancelled = false;
    if (chapterId === null || !fontUrl) {
      setState(IDLE_STATE);
      return () => {
        cancelled = true;
      };
    }

    setState({ status: 'loading', font: null, error: undefined });
    void loadReaderBookFont({ chapterId, content, fontUrl })
      .then((font) => {
        if (!cancelled) setState({ status: 'loaded', font, error: undefined });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            font: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, chapterId, content, fontUrl]);

  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
