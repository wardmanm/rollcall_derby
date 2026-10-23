import { useState } from 'react';
import { Button, FileButton, Group, Image, Stack, Text } from '@mantine/core';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '@rollcall/core-contract';

export interface ImagePickerProps {
  /** What the image is, such as "Logo" or "Photo". */
  label: string;
  /** The image's address (/media/<id>), or null when there's none. */
  imageUrl: string | null;
  /** Describes the image for people who can't see it, such as "All Stars logo". */
  alt: string;
  /** Called with a file that passed the checks below. */
  onPick: (file: File) => void;
  /** Removes the image. Without it, there's no Remove button. */
  onRemove?: () => void;
  /** While an upload or removal is under way. */
  busy?: boolean;
}

const isImageType = (type: string) => IMAGE_TYPES.some((allowed) => allowed === type);

/** Why a picked file can't be uploaded, or null. The server checks again, by the file's bytes (ADR-0022). */
export function imageProblem(file: File): string | null {
  if (!isImageType(file.type)) return 'Use a PNG, JPEG or WebP image';
  if (file.size > MAX_IMAGE_BYTES) return 'That image is over 5 MB';
  return null;
}

// A logo or photo: the image (or a note that there's none), a button to choose a new one, and Remove. A file is checked
// in the browser before it's sent, so the person hears at once what's wrong with it.
export function ImagePicker({ label, imageUrl, alt, onPick, onRemove, busy = false }: ImagePickerProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const pick = (file: File | null) => {
    if (!file) return;
    const found = imageProblem(file);
    setProblem(found);
    if (!found) onPick(file);
  };
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {label}
      </Text>
      {imageUrl ? (
        <Image src={imageUrl} alt={alt} w={96} h={96} fit="contain" radius="sm" />
      ) : (
        <Text size="sm">No {label.toLowerCase()} yet.</Text>
      )}
      <Group gap="xs">
        <FileButton onChange={pick} accept={IMAGE_TYPES.join(',')}>
          {(props) => (
            <Button {...props} variant="default" size="xs" loading={busy}>
              {imageUrl ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
            </Button>
          )}
        </FileButton>
        {imageUrl && onRemove && (
          <Button variant="subtle" color="red" size="xs" onClick={onRemove} disabled={busy}>
            Remove {label.toLowerCase()}
          </Button>
        )}
      </Group>
      {problem && (
        <Text size="sm" c="red" role="alert">
          {problem}
        </Text>
      )}
    </Stack>
  );
}
