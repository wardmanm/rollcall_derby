import { z } from 'zod';

// Teams and their members (docs/features/team-builder.md). Server and web share these shapes. Logos and photos are
// media: uploaded images served at /media/<id> (ADR-0022).

/** The image types a logo or photo may be. The server checks a file's bytes, not just its stated type. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const ImageTypeSchema = z.enum(IMAGE_TYPES);
export type ImageType = z.infer<typeof ImageTypeSchema>;

/** The largest logo or photo the server accepts: 5 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const MEMBER_KINDS = ['skater', 'bench'] as const;
export const MemberKindSchema = z.enum(MEMBER_KINDS);
export type MemberKind = z.infer<typeof MemberKindSchema>;

// The fixed roles, each for one kind of member. Members can have custom roles of their own as well.
export const SKATER_ROLES = ['captain', 'alt-captain'] as const;
export const BENCH_ROLES = ['bench-coach', 'bench-manager', 'bench-alt-captain'] as const;
export const MemberRoleSchema = z.enum([...SKATER_ROLES, ...BENCH_ROLES]);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const MEMBER_ROLE_NAMES: Record<MemberRole, string> = {
  captain: 'Captain',
  'alt-captain': 'Alt captain',
  'bench-coach': 'Bench coach',
  'bench-manager': 'Bench manager',
  'bench-alt-captain': 'Bench alt captain',
};

/** The roles a team has at most one of. */
export const ONE_PER_TEAM: readonly MemberRole[] = ['captain', 'alt-captain'];

const rolesFor = (kind: MemberKind): readonly MemberRole[] => (kind === 'skater' ? SKATER_ROLES : BENCH_ROLES);

// Optional text arrives as a string, empty or not, or null. Blank means none.
const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema.nullable());

const TeamNameSchema = z.string().trim().min(1, 'Give the team a name').max(64, 'Use at most 64 characters');
const LeagueNameSchema = z.string().trim().max(64, 'Use at most 64 characters');
const ShortNameSchema = z.string().trim().max(8, 'Use at most 8 characters');
export const ColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/, 'Use a color like #1a2b3c');

const MemberNameSchema = z.string().trim().min(1, 'Give a name').max(64, 'Use at most 64 characters');
/** A skater's number: text, so 00 and 07 keep their zeros. */
export const MemberNumberSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z]{1,4}$/, 'Use 1–4 letters or digits');
const PronounsSchema = z.string().trim().max(32, 'Use at most 32 characters');
const CustomRoleSchema = z.string().trim().min(1, 'Give the role a name').max(32, 'Use at most 32 characters');
const CustomRolesSchema = z
  .array(CustomRoleSchema)
  .max(3, 'Use at most 3 custom roles')
  .refine((roles) => new Set(roles).size === roles.length, 'Each custom role only once');

export const TeamMemberSchema = z.strictObject({
  id: z.string(),
  kind: MemberKindSchema,
  name: z.string(),
  number: z.string().nullable(),
  pronouns: z.string().nullable(),
  roles: z.array(MemberRoleSchema),
  customRoles: z.array(z.string()),
  photoUrl: z.string().nullable(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

const TeamFields = {
  id: z.string(),
  name: z.string(),
  leagueName: z.string().nullable(),
  shortName: z.string().nullable(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  logoUrl: z.string().nullable(),
  updatedAt: z.iso.datetime(),
};

export const TeamSummarySchema = z.strictObject({
  ...TeamFields,
  skaterCount: z.number().int(),
  benchCount: z.number().int(),
});
export type TeamSummary = z.infer<typeof TeamSummarySchema>;

/** A team with its members: skaters by number, then bench staff by name. */
export const TeamSchema = z.strictObject({
  ...TeamFields,
  createdAt: z.iso.datetime(),
  members: z.array(TeamMemberSchema),
});
export type Team = z.infer<typeof TeamSchema>;

export const CreateTeamRequestSchema = z.strictObject({
  name: TeamNameSchema,
  leagueName: optional(LeagueNameSchema).default(null),
  shortName: optional(ShortNameSchema).default(null),
  primaryColor: optional(ColorSchema).default(null),
  secondaryColor: optional(ColorSchema).default(null),
});
export type CreateTeamRequest = z.input<typeof CreateTeamRequestSchema>;

/** A missing field stays as it is; null (or blank) clears it. */
export const UpdateTeamRequestSchema = z.strictObject({
  name: TeamNameSchema.optional(),
  leagueName: optional(LeagueNameSchema).optional(),
  shortName: optional(ShortNameSchema).optional(),
  primaryColor: optional(ColorSchema).optional(),
  secondaryColor: optional(ColorSchema).optional(),
});
export type UpdateTeamRequest = z.input<typeof UpdateTeamRequestSchema>;

/** The fields of a member that a request sets. */
export interface MemberFields {
  kind: MemberKind;
  name: string;
  number: string | null;
  pronouns: string | null;
  roles: readonly MemberRole[];
  customRoles: readonly string[];
}

/**
 * What's wrong with a member on its own, or null: a skater needs a number and bench staff have none, and each role
 * must be one for the member's kind. Whether a number or role is already taken is the server's to check.
 */
export function memberProblem(member: MemberFields): { field: keyof MemberFields; message: string } | null {
  if (member.kind === 'skater' && member.number === null)
    return { field: 'number', message: 'Give the skater a number' };
  if (member.kind === 'bench' && member.number !== null)
    return { field: 'number', message: 'Bench staff have no number' };
  const allowed = rolesFor(member.kind);
  const wrong = member.roles.find((role) => !allowed.includes(role));
  if (wrong) {
    const who = member.kind === 'skater' ? 'a skater' : 'bench staff';
    return { field: 'roles', message: `${MEMBER_ROLE_NAMES[wrong]} isn't a role for ${who}` };
  }
  if (new Set(member.roles).size !== member.roles.length) return { field: 'roles', message: 'Each role only once' };
  return null;
}

export const CreateMemberRequestSchema = z
  .strictObject({
    kind: MemberKindSchema,
    name: MemberNameSchema,
    number: optional(MemberNumberSchema).default(null),
    pronouns: optional(PronounsSchema).default(null),
    roles: z.array(MemberRoleSchema).default([]),
    customRoles: CustomRolesSchema.default([]),
  })
  .superRefine((member, context) => {
    const problem = memberProblem(member);
    if (problem) context.addIssue({ code: 'custom', path: [problem.field], message: problem.message });
  });
export type CreateMemberRequest = z.input<typeof CreateMemberRequestSchema>;

/** A missing field stays as it is. The server checks the member that results, as memberProblem says. */
export const UpdateMemberRequestSchema = z.strictObject({
  kind: MemberKindSchema.optional(),
  name: MemberNameSchema.optional(),
  number: optional(MemberNumberSchema).optional(),
  pronouns: optional(PronounsSchema).optional(),
  roles: z.array(MemberRoleSchema).optional(),
  customRoles: CustomRolesSchema.optional(),
});
export type UpdateMemberRequest = z.input<typeof UpdateMemberRequestSchema>;
