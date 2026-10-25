import { Text } from '@mantine/core';

/** The line every font is shown with: letters, digits and the dashes and dots derby names and scores use. */
export const SAMPLE_LINE = 'Jam 3 · Rollcall 128–96';

// A sample line in one font family, falling back to the system font while it loads or when it's missing. The page
// showing it adds the family's @font-face rules.
export function FontSample({ family, weight = 400 }: { family: string; weight?: number }) {
  return (
    <Text size="xl" style={{ fontFamily: `"${family}", system-ui, sans-serif`, fontWeight: weight }}>
      {SAMPLE_LINE}
    </Text>
  );
}
