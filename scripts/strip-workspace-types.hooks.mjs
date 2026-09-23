import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts']);

/**
 * Node refuses to strip types for a file it resolves under node_modules ("Stripping
 * types is currently unsupported for files under node_modules"), and npm installs
 * workspace packages as real directories there rather than as symlinks. Our shared
 * packages publish their raw `.ts` sources, so any Node test that imports one *by
 * value* dies before it runs — even though the identical import typechecks and bundles
 * fine in the app.
 *
 * Transpile those files here instead of letting Node reject them. Only files under
 * node_modules are touched, so ordinary app sources keep using Node's own stripping.
 *
 * Registered by `--import=../../scripts/strip-workspace-types.mjs`, which every `test`
 * script under apps/mobile and packages/ passes — the flag resolves relative to that
 * package's directory. Add it to a new `test` script that runs `--test` over sources
 * importing a workspace package by value.
 */
export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:') || !url.includes('/node_modules/')) {
    return nextLoad(url, context);
  }

  const path = fileURLToPath(url);
  if (!TYPESCRIPT_EXTENSIONS.has(extname(path))) {
    return nextLoad(url, context);
  }

  const { outputText } = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path,
  });

  // The workspace packages are `"type": "module"`, so the EMIT is always ESM.
  return { format: 'module', source: outputText, shortCircuit: true };
}
