import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from '@rollcall/web-sdk';
import { json, signedIn } from '@rollcall/web-sdk/testing';
import { useGetIntroQuery, useUpdateIntroMutation } from './api.ts';
import { intro, MANAGER } from './test/intro-fixtures.ts';

afterEach(() => vi.unstubAllGlobals());

const SAVED = intro('i1', 'Saturday bout');
const REPLY = { ...SAVED, name: 'Sunday bout', updatedAt: '2026-11-01T11:00:00.000Z' };

function useIntroAndSave() {
  return { intro: useGetIntroQuery('i1'), save: useUpdateIntroMutation()[0] };
}

describe('saving an intro', () => {
  it('shows the reply at once, and keeps it when an older fetch lands after it', async () => {
    // The first fetch answers at once. The second is held until the save has replied, then answers with the intro
    // as it was before the save. Any later one never answers.
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let fetches = 0;
    signedIn(MANAGER, {
      'GET /api/producer/intros/i1': async () => {
        const fetch = ++fetches;
        if (fetch === 2) await held;
        return fetch <= 2 ? Response.json(SAVED) : new Promise<Response>(() => {});
      },
      'PATCH /api/producer/intros/i1': json(REPLY),
    });
    const store = makeStore();
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
    const { result } = renderHook(useIntroAndSave, { wrapper });
    await waitFor(() => expect(result.current.intro.data).toEqual(SAVED));

    act(() => void result.current.intro.refetch());
    await waitFor(() => expect(fetches).toBe(2));
    await act(() => result.current.save({ id: 'i1', changes: { name: 'Sunday bout' } }));
    // The older fetch is still held, so only the reply can show here.
    await waitFor(() => expect(result.current.intro.data).toEqual(REPLY));
    expect(result.current.intro.isFetching).toBe(true);
    const older = result.current.intro.requestId;

    // Once it lands, the fetch the save set off starts, so the page has had the older one by then.
    act(() => release?.());
    await waitFor(() => expect(result.current.intro.requestId).not.toBe(older));
    expect(result.current.intro.data).toEqual(REPLY);
  });
});
