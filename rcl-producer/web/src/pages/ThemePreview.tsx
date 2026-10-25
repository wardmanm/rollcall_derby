import { useState } from 'react';
import { SegmentedControl, Stack, Text } from '@mantine/core';
import type { ThemeCss } from '@rollcall/producer-contract';
import { PlaceholderCard } from '../overlay/components/PlaceholderCard.tsx';
import { ThemeSample } from '../overlay/components/ThemeSample.tsx';
import { ThemeScope } from '../overlay/ThemeScope.tsx';
import classes from './ThemePreview.module.css';

const BACKDROPS = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'checkerboard', label: 'Checkerboard' },
] as const;
type Backdrop = (typeof BACKDROPS)[number]['value'];
const isBackdrop = (value: string): value is Backdrop => BACKDROPS.some((backdrop) => backdrop.value === value);

// A theme on overlay components, as the OBS overlay shows it: the same ThemeScope and components, plain CSS without
// Mantine, over a background the person chooses.
export function ThemePreview({ css, extras }: { css: ThemeCss; extras: readonly string[] }) {
  const [backdrop, setBackdrop] = useState<Backdrop>('dark');
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500} id="preview-background">
        Preview background
      </Text>
      <SegmentedControl
        aria-labelledby="preview-background"
        data={[...BACKDROPS]}
        value={backdrop}
        onChange={(value) => isBackdrop(value) && setBackdrop(value)}
      />
      <div className={`${classes.stage} ${classes[backdrop]}`}>
        <ThemeScope css={css}>
          <div className={classes.stage}>
            <PlaceholderCard title="Rollcall" subtitle="Theme preview" />
            <ThemeSample extras={extras} />
          </div>
        </ThemeScope>
      </div>
    </Stack>
  );
}
