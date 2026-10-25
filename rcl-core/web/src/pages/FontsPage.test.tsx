import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { FontFamily } from '@rollcall/core-contract';
import { ADMIN, ANNOUNCER, json, noContent, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openCore } from '../test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const INTER: FontFamily = {
  name: 'Inter',
  bundled: true,
  faces: [
    {
      id: 'bundled-inter',
      weightMin: 100,
      weightMax: 900,
      style: 'normal',
      format: 'font/ttf',
      url: '/fonts/inter/inter.ttf',
    },
  ],
};
const ROLLERBALL: FontFamily = {
  name: 'Rollerball',
  bundled: false,
  faces: [
    { id: 'f1', weightMin: 400, weightMax: 400, style: 'normal', format: 'font/woff2', url: '/media/aaa' },
    { id: 'f2', weightMin: 700, weightMax: 700, style: 'italic', format: 'font/woff2', url: '/media/bbb' },
  ],
};
const LIBRARY = [INTER, ROLLERBALL];
const SAMPLE = 'Jam 3 · Rollcall 128–96';

const rowOf = (name: string) => within(screen.getByRole('table')).getByText(name).closest('tr')!;
const fileInput = () => document.body.querySelector<HTMLInputElement>('input[type="file"]')!;
const pickFile = (file: File) => fireEvent.change(fileInput(), { target: { files: [file] } });
// A font file as a browser often gives it: its type left blank.
const woff2 = (name: string, size?: number) =>
  new File([size === undefined ? 'wOF2' : new Uint8Array(size)], name, { type: '' });

async function openFonts(user = ADMIN, more = {}) {
  const server = signedIn(user, { 'GET /api/core/fonts': json(LIBRARY), ...more });
  openCore('/core/fonts');
  await within(await screen.findByRole('table')).findByText('Rollerball');
  return server;
}

describe('the Fonts page', () => {
  it('lists each family with a sample line in its own font, its faces, and which come with Rollcall', async () => {
    await openFonts(PRODUCER);
    expect(within(rowOf('Inter')).getByText('Bundled')).toBeTruthy();
    expect(within(rowOf('Inter')).getByText('100–900')).toBeTruthy();
    expect(within(rowOf('Rollerball')).getByText('400')).toBeTruthy();
    expect(within(rowOf('Rollerball')).getByText('700 italic')).toBeTruthy();
    expect(within(rowOf('Rollerball')).queryByText('Bundled')).toBeNull();
    expect(within(rowOf('Rollerball')).getByText(SAMPLE).style.fontFamily).toContain('Rollerball');
    const rules = [...document.querySelectorAll('style')].map((style) => style.textContent).join('\n');
    expect(rules).toContain('font-family: "Rollerball";');
    expect(rules).toContain('src: url("/media/bbb") format("woff2");');
    expect(screen.getByRole('link', { name: 'Fonts' })).toBeTruthy();
  });

  it('is read-only for Producers and Announcers', async () => {
    for (const user of [PRODUCER, ANNOUNCER]) {
      await openFonts(user);
      expect(screen.queryByRole('button', { name: /Remove/ }), user.role).toBeNull();
      expect(screen.queryByRole('button', { name: 'Upload font' }), user.role).toBeNull();
      document.body.innerHTML = '';
    }
  });

  it('uploads a font as the file itself, suggesting its family, weight and style from the file name', async () => {
    let sent: URLSearchParams | undefined;
    const { requests } = await openFonts(ADMIN, {
      'POST /api/core/fonts/faces': (request: Request) => {
        sent = new URL(request.url).searchParams;
        return Response.json(ROLLERBALL, { status: 201 });
      },
    });
    expect(screen.getByText('Upload only fonts you’re licensed to use in a broadcast.')).toBeTruthy();
    pickFile(woff2('Jammer-BoldItalic.woff2'));
    expect(await screen.findByText('Jammer-BoldItalic.woff2')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Family').value).toBe('Jammer');
    expect(screen.getByLabelText<HTMLInputElement>('Weight').value).toBe('700');
    expect(screen.getByLabelText<HTMLSelectElement>('Style').value).toBe('italic');
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'Jammer Sans' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload font' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        method: 'POST',
        path: '/api/core/fonts/faces',
        body: 'wOF2',
        contentType: 'font/woff2',
      }),
    );
    expect(Object.fromEntries(sent ?? [])).toEqual({ family: 'Jammer Sans', weight: '700', style: 'italic' });
    await vi.waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Family').value).toBe(''));
  });

  it('refuses a file that is not a font, or is over 5 MB, before sending it', async () => {
    const { requests } = await openFonts();
    pickFile(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(await screen.findByText('Use a WOFF2, WOFF, TTF or OTF font')).toBeTruthy();
    pickFile(woff2('Huge.woff2', 5 * 1024 * 1024 + 1));
    expect(await screen.findByText('That font is over 5 MB')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Upload font' }).disabled).toBe(true);
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('checks the family and weight against the contract before sending', async () => {
    const { requests } = await openFonts();
    pickFile(woff2('Jammer.woff2'));
    fireEvent.change(await screen.findByLabelText('Family'), { target: { value: 'Bad;Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload font' }));
    expect(await screen.findByText('Use 1–64 letters, digits, spaces, dashes or underscores')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'Jammer' } });
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '900-100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload font' }));
    expect(await screen.findByText('Use weights from 100 to 900, lowest first')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it("shows the server's reason when it refuses an upload", async () => {
    await openFonts(ADMIN, {
      'POST /api/core/fonts/faces': json(
        { error: 'family_bundled', message: 'Inter comes with Rollcall. Upload yours under another family name.' },
        409,
      ),
    });
    pickFile(woff2('Inter-Bold.woff2'));
    fireEvent.click(await screen.findByRole('button', { name: 'Upload font' }));
    expect(await screen.findByText('Inter comes with Rollcall. Upload yours under another family name.')).toBeTruthy();
  });

  it('removes an uploaded face once you confirm, and never a bundled one', async () => {
    const { requests } = await openFonts(ADMIN, { 'DELETE /api/core/fonts/faces/f2': noContent });
    expect(within(rowOf('Inter')).queryByRole('button', { name: /Remove/ })).toBeNull();
    fireEvent.click(within(rowOf('Rollerball')).getByRole('button', { name: 'Remove Rollerball 700 italic' }));
    const confirm = await screen.findByRole('dialog', { name: 'Remove Rollerball 700 italic?' });
    expect(
      within(confirm).getByText('Themes that use it fall back to another face, or to a system font.'),
    ).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove font' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'DELETE', path: '/api/core/fonts/faces/f2', body: undefined }),
    );
  });

  it('hides the page and its link from someone who may not view fonts', async () => {
    signedIn({ ...PRODUCER, permissions: ['core:teams.read'] });
    openCore('/core/fonts');
    expect(await screen.findByText("Your account can't view fonts.")).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Fonts' })).toBeNull();
  });
});
