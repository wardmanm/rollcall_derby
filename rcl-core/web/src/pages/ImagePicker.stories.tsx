import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ImagePicker } from './ImagePicker.tsx';

// A stand-in logo, inline so the story loads nothing from outside (hard rule 4).
const LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="44" fill="#aa0000"/>' +
      '<text x="48" y="58" font-size="28" text-anchor="middle" fill="#fff" font-family="sans-serif">RCR</text></svg>',
  );

const meta = {
  title: 'Teams/ImagePicker',
  component: ImagePicker,
  args: { label: 'Logo', alt: 'All Stars logo', onPick: fn(), onRemove: fn() },
} satisfies Meta<typeof ImagePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoImageYet: Story = { args: { imageUrl: null } };

export const WithImage: Story = { args: { imageUrl: LOGO } };

export const Uploading: Story = { args: { imageUrl: LOGO, busy: true } };

/** A new member's photo, picked but not uploaded until Save. */
export const PhotoChosen: Story = { args: { label: 'Photo', alt: '', imageUrl: null, chosen: 'jammy.png' } };
