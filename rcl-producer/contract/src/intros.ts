import { z } from 'zod';
import { MEMBER_ROLE_NAMES, MemberKindSchema } from '@rollcall/core-contract';
import type { Team, TeamMember, TeamSummary } from '@rollcall/core-contract';

// Skater intros: an overlay that introduces each team's people, run live from a control page. These are the shapes the
// server, the control page and the overlay share.

export const ROSTER_ENTRANCES = ['pop', 'slide-up', 'fade', 'wipe'] as const;
export const RosterEntranceSchema = z.enum(ROSTER_ENTRANCES);
export type RosterEntrance = z.infer<typeof RosterEntranceSchema>;

export const ROSTER_SPOTS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
export const RosterSpotSchema = z.enum(ROSTER_SPOTS);
export type RosterSpot = z.infer<typeof RosterSpotSchema>;

export const INTRO_TEAM_SLOTS = ['a', 'b'] as const;
export const IntroTeamSlotSchema = z.enum(INTRO_TEAM_SLOTS);
export type IntroTeamSlot = z.infer<typeof IntroTeamSlotSchema>;

export const RosterOptionsSchema = z.strictObject({
  atOnce: z.union([z.number().int().min(1).max(20), z.literal('team')]),
  advance: z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('next') }),
    z.strictObject({ mode: z.literal('timer'), seconds: z.number().int().min(2).max(60) }),
  ]),
  entrance: RosterEntranceSchema,
  /** Whether the role line ends with the person's pronouns. Intros saved before this existed read as on. */
  showPronouns: z.boolean().default(true),
});
export type RosterOptions = z.infer<typeof RosterOptionsSchema>;
/** What a card's text is made from; the pronouns show unless this says not to. */
export type RoleLineOptions = Pick<RosterOptions, 'showPronouns'>;

export const DEFAULT_ROSTER_OPTIONS: RosterOptions = {
  atOnce: 1,
  advance: { mode: 'next' },
  entrance: 'pop',
  showPronouns: true,
};

/** Where the cards sit on the screen: a spot, and how far in from the nearest edge, in pixels. */
export const IntroPlacementSchema = z.strictObject({
  spot: RosterSpotSchema,
  edge: z.number().int().min(0).max(200),
});
export type IntroPlacement = z.infer<typeof IntroPlacementSchema>;

export const DEFAULT_PLACEMENT: IntroPlacement = { spot: 'bottom-center', edge: 48 };

const IntroNameSchema = z.string().trim().min(1, 'Give the intro a name').max(64, 'Use at most 64 characters');

export const IntroSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  teamAId: z.string().nullable(),
  teamBId: z.string().nullable(),
  themeId: z.string().nullable(),
  placement: IntroPlacementSchema,
  options: RosterOptionsSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Intro = z.infer<typeof IntroSchema>;

export const CreateIntroRequestSchema = z.strictObject({ name: IntroNameSchema });
export type CreateIntroRequest = z.input<typeof CreateIntroRequestSchema>;

/** A missing field stays as it is. */
export const UpdateIntroRequestSchema = z
  .strictObject({
    name: IntroNameSchema.optional(),
    teamAId: z.string().nullable().optional(),
    teamBId: z.string().nullable().optional(),
    themeId: z.string().nullable().optional(),
    placement: IntroPlacementSchema.optional(),
    options: RosterOptionsSchema.optional(),
  })
  .refine((fields) => fields.teamAId == null || fields.teamAId !== fields.teamBId, {
    message: 'Pick two different teams',
    path: ['teamBId'],
  });
export type UpdateIntroRequest = z.input<typeof UpdateIntroRequestSchema>;

export const StartIntroRequestSchema = z.strictObject({ team: IntroTeamSlotSchema });
export type StartIntroRequest = z.infer<typeof StartIntroRequestSchema>;

export const NextIntroRequestSchema = z.strictObject({ revision: z.number().int().min(0).optional() });
export type NextIntroRequest = z.infer<typeof NextIntroRequestSchema>;

// What is on air.

export const RosterTeamSchema = z.strictObject({
  name: z.string(),
  leagueName: z.string().nullable(),
  logoUrl: z.string().nullable(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
});
export type RosterTeam = z.infer<typeof RosterTeamSchema>;

export const RosterCardSchema = z.strictObject({
  id: z.string(),
  kind: MemberKindSchema,
  name: z.string(),
  number: z.string().nullable(),
  roleLine: z.string(),
  photoUrl: z.string().nullable(),
});
export type RosterCard = z.infer<typeof RosterCardSchema>;

export const RosterOnAirSchema = z.strictObject({
  team: RosterTeamSchema,
  title: z.boolean(),
  cards: z.array(RosterCardSchema),
  upNext: RosterCardSchema.nullable(),
  slots: z.number().int().min(1),
  entrance: RosterEntranceSchema,
  placement: IntroPlacementSchema,
});
export type RosterOnAir = z.infer<typeof RosterOnAirSchema>;

export const IntroOverlayStateSchema = z.strictObject({
  revision: z.number().int().min(0),
  onAir: RosterOnAirSchema.nullable(),
});
export type IntroOverlayState = z.infer<typeof IntroOverlayStateSchema>;

/** The control page's view of a run: who is on screen and who is next, by member id. */
export const IntroRunSchema = z.strictObject({
  revision: z.number().int().min(0),
  team: IntroTeamSlotSchema.nullable(),
  title: z.boolean(),
  onAir: z.boolean(),
  people: z.array(
    z.strictObject({ id: z.string(), name: z.string(), number: z.string().nullable(), kind: MemberKindSchema }),
  ),
  onScreen: z.array(z.string()),
  next: z.string().nullable(),
  done: z.boolean(),
  timerMsLeft: z.number().int().min(0).nullable(),
});
export type IntroRun = z.infer<typeof IntroRunSchema>;

// Helpers

/** A member's fixed roles, custom roles and (unless `showPronouns` is false) pronouns on one line. */
export function roleLine(member: TeamMember, { showPronouns = true }: Partial<RoleLineOptions> = {}): string {
  const pronouns = showPronouns ? (member.pronouns ?? '') : '';
  return [...member.roles.map((role) => MEMBER_ROLE_NAMES[role]), ...member.customRoles, pronouns]
    .filter((part) => part !== '')
    .join(' · ');
}

export function rosterCard(member: TeamMember, options: Partial<RoleLineOptions> = {}): RosterCard {
  return {
    id: member.id,
    kind: member.kind,
    name: member.name,
    number: member.number,
    roleLine: roleLine(member, options),
    photoUrl: member.photoUrl,
  };
}

export function rosterTeam(team: Team | TeamSummary): RosterTeam {
  return {
    name: team.name,
    leagueName: team.leagueName,
    logoUrl: team.logoUrl,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
  };
}
