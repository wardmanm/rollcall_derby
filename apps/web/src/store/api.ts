import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { HealthResponse } from '@obs-producer/shared';
import { parseHealth } from '../health.ts';

// All server data lives in RTK Query, never copied into slices (hard rule 6, ADR-0003).
// Responses are validated against the shared Zod contract (ADR-0007).
export const api = createApi({
  reducerPath: 'api',
  // Absolute so it also works where relative URLs can't be resolved (e.g. Node's fetch in tests).
  baseQuery: fetchBaseQuery({ baseUrl: `${window.location.origin}/api/` }),
  endpoints: (build) => ({
    getHealth: build.query<HealthResponse, void>({
      query: () => 'health',
      transformResponse: (response: unknown) => parseHealth(response),
    }),
  }),
});

export const { useGetHealthQuery } = api;
