import { createTheme } from '@mantine/core';

// Every rcl app's Mantine theme. Filled buttons and badges use shade 8, the lightest whose white text still clears the
// 4.5:1 contrast the story tests check (ADR-0015); Mantine's default, shade 6, doesn't.
export const theme = createTheme({ primaryShade: { light: 8, dark: 8 } });
