import type { TeamSummary } from '@rollcall/core-contract';
import { DEFAULT_PLACEMENT, DEFAULT_ROSTER_OPTIONS, type Intro } from '@rollcall/producer-contract';
import { PRODUCER } from '@rollcall/web-sdk/testing';

export const RUNNER = { ...PRODUCER, permissions: [...PRODUCER.permissions, 'producer:intros.run'] };
export const MANAGER = { ...RUNNER, permissions: [...RUNNER.permissions, 'producer:intros.manage'] };

export const summary = (id: string, name: string): TeamSummary => ({
  id,
  name,
  leagueName: null,
  shortName: null,
  primaryColor: null,
  secondaryColor: null,
  logoUrl: null,
  updatedAt: '2026-11-01T10:00:00.000Z',
  skaterCount: 2,
  benchCount: 0,
});

export const intro = (id: string, name: string, change: Partial<Intro> = {}): Intro => ({
  id,
  name,
  teamAId: null,
  teamBId: null,
  themeId: null,
  placement: DEFAULT_PLACEMENT,
  options: DEFAULT_ROSTER_OPTIONS,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...change,
});
