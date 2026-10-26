import {
  ImportPreviewSchema,
  ImportResultSchema,
  type ExportSelection,
  type ImportChoices,
  type ImportPreview,
  type ImportResult,
} from '@rollcall/core-contract';
import { api } from './api.ts';

// Import and export for every rcl app's pages (docs/features/import-export.md): rcl-core's transfer routes, which take
// every app's kinds of item (ADR-0024).

/** Where to download an export file of `selection`, for a link: the browser saves the .zip the server replies with. */
export function exportUrl(selection: ExportSelection): string {
  const query =
    'items' in selection
      ? ['items', selection.items.map(({ kind, id }) => `${kind}:${id}`).join(',')]
      : ['kinds', selection.kinds.join(',')];
  return `/api/core/transfer/export?${new URLSearchParams([query]).toString()}`;
}

// The file as the request body, typed as a .zip: browsers label one either way, or not at all.
const zipOf = (file: Blob) => new Blob([file], { type: 'application/zip' });

const transferApi = api.injectEndpoints({
  endpoints: (build) => ({
    previewImport: build.mutation<ImportPreview, Blob>({
      query: (file) => ({ url: 'core/transfer/import/preview', method: 'POST', body: zipOf(file) }),
      transformResponse: (response: unknown) => ImportPreviewSchema.parse(response),
    }),
    importFile: build.mutation<ImportResult, { file: Blob; choices: ImportChoices }>({
      query: ({ file, choices }) => ({
        url: 'core/transfer/import',
        method: 'POST',
        params: { choices: JSON.stringify(choices) },
        body: zipOf(file),
      }),
      transformResponse: (response: unknown) => ImportResultSchema.parse(response),
    }),
  }),
});

export const { usePreviewImportMutation, useImportFileMutation } = transferApi;

/** What an import did, in a sentence: "Imported 5: 3 new, 1 replaced, 1 kept as a copy (“All Stars copy”)." */
export function importSummary({ added, replaced, keptBoth, skipped, copies }: ImportResult): string {
  const total = added + replaced + keptBoth;
  const copiesSaid = copies.map((name) => `“${name}”`).join(', ');
  const parts = [
    added > 0 ? `${added} new` : '',
    replaced > 0 ? `${replaced} replaced` : '',
    keptBoth > 0 ? `${keptBoth} kept as ${keptBoth === 1 ? 'a copy' : 'copies'} (${copiesSaid})` : '',
  ].filter((part) => part !== '');
  const imported = total === 0 ? 'Imported nothing' : `Imported ${total}: ${parts.join(', ')}`;
  return skipped > 0 ? `${imported}. Skipped ${skipped}.` : `${imported}.`;
}
