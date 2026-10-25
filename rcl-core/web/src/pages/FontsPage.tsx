import { useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  FileButton,
  Group,
  Modal,
  NativeSelect,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  fontFaceRules,
  UploadFontFaceQuerySchema,
  type FontFace,
  type FontFamily,
  type FontStyle,
} from '@rollcall/core-contract';
import { fieldErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
import { useGetFontsQuery, useRemoveFontFaceMutation, useUploadFontFaceMutation } from '../api.ts';
import { fontProblem, fontTypeOf, suggestFace } from './font-files.ts';
import { FontSample } from './FontSample.tsx';

// The font library (docs/features/theme-builder.md): the families that come with Rollcall and those Admins upload,
// each shown in its own font. core:fonts.read may look, and core:fonts.manage may upload and remove faces. Hiding
// things is only for convenience: the server checks every request (hard rule 5).
export function FontsPage() {
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('core:fonts.read')) return <Alert color="gray">Your account can't view fonts.</Alert>;
  return <FontLibrary canManage={me.permissions.includes('core:fonts.manage')} />;
}

/** A face as people read it: "400", or "100–900" for a variable font, with "italic" after an italic one. */
export function faceLabel(face: FontFace): string {
  const weights = face.weightMin === face.weightMax ? `${face.weightMin}` : `${face.weightMin}–${face.weightMax}`;
  return face.style === 'italic' ? `${weights} italic` : weights;
}

interface Removing {
  family: FontFamily;
  face: FontFace;
}

function FontLibrary({ canManage }: { canManage: boolean }) {
  const fonts = useGetFontsQuery();
  const [removing, setRemoving] = useState<Removing | null>(null);
  // Every family's faces, so each sample line shows in its own font.
  const rules = useMemo(() => fontFaceRules(fonts.data ?? []), [fonts.data]);
  return (
    <Stack maw={980}>
      <Title order={2}>Fonts</Title>
      {canManage && <UploadFont />}
      {fonts.isError && <Alert color="red">{problemWith(fonts.error)}</Alert>}
      {rules && <style>{rules}</style>}
      {fonts.data && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Family</Table.Th>
              <Table.Th>Sample</Table.Th>
              <Table.Th>Faces</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {fonts.data.map((family) => (
              <FamilyRow
                key={family.name}
                family={family}
                onRemove={canManage ? (face) => setRemoving({ family, face }) : undefined}
              />
            ))}
          </Table.Tbody>
        </Table>
      )}
      {removing && <RemoveFace {...removing} onClose={() => setRemoving(null)} />}
    </Stack>
  );
}

// A family: its name, a sample line, and its faces. Uploaded faces get Remove when `onRemove` is given.
function FamilyRow({ family, onRemove }: { family: FontFamily; onRemove?: (face: FontFace) => void }) {
  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <Text fw={500}>{family.name}</Text>
          {family.bundled && (
            <Badge variant="light" color="gray">
              Bundled
            </Badge>
          )}
        </Group>
      </Table.Td>
      <Table.Td>
        <FontSample family={family.name} />
      </Table.Td>
      <Table.Td>
        <Stack gap={4}>
          {family.faces.map((face) => (
            <Group key={face.id} gap="xs">
              <Text size="sm">{faceLabel(face)}</Text>
              {onRemove && !family.bundled && (
                <Button
                  variant="subtle"
                  color="red"
                  size="compact-xs"
                  aria-label={`Remove ${family.name} ${faceLabel(face)}`}
                  onClick={() => onRemove(face)}
                >
                  Remove
                </Button>
              )}
            </Group>
          ))}
        </Stack>
      </Table.Td>
    </Table.Tr>
  );
}

// Removes an uploaded face once the person confirms.
function RemoveFace({ family, face, onClose }: Removing & { onClose: () => void }) {
  const [removeFontFace, { isLoading }] = useRemoveFontFaceMutation();
  const [problem, setProblem] = useState<string | null>(null);
  const name = `${family.name} ${faceLabel(face)}`;
  const confirm = async () => {
    const result = await removeFontFace(face.id);
    if (result.error) setProblem(problemWith(result.error, { not_found: 'That font was already removed.' }));
    else onClose();
  };
  return (
    <Modal opened onClose={onClose} title={`Remove ${name}?`}>
      <Stack>
        <Text>Themes that use it fall back to another face, or to a system font.</Text>
        {problem && <Alert color="red">{problem}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" loading={isLoading} onClick={() => void confirm()}>
            Remove font
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

const STYLES = [
  { value: 'normal', label: 'Normal' },
  { value: 'italic', label: 'Italic' },
];

// Uploads one face: choose a file, which is checked at once and suggests its family, weight and style, correct them,
// then Upload. The fields are checked against the contract before anything is sent.
function UploadFont() {
  const [uploadFontFace, { isLoading, error, reset }] = useUploadFontFaceMutation();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [family, setFamily] = useState('');
  const [weight, setWeight] = useState('400');
  const [style, setStyle] = useState<FontStyle>('normal');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const choose = (picked: File | null) => {
    if (!picked) return;
    reset();
    setErrors({});
    const found = fontProblem(picked);
    setProblem(found);
    setFile(found ? null : picked);
    if (found) return;
    const suggested = suggestFace(picked.name);
    setFamily(suggested.family);
    setWeight(suggested.weight);
    setStyle(suggested.style);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const type = file ? fontTypeOf(file.name) : undefined;
    if (!file || !type) return;
    const face = { family, weight, style };
    const checked = UploadFontFaceQuerySchema.safeParse(face);
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    if (!checked.success) return;
    const result = await uploadFontFace({ face, file, type });
    if (!result.data) return;
    setFile(null);
    setFamily('');
    setWeight('400');
    setStyle('normal');
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Stack gap="xs">
        <Title order={3}>Upload a font</Title>
        <Text size="sm">Upload only fonts you’re licensed to use in a broadcast.</Text>
        <Group>
          <FileButton onChange={choose} accept=".woff2,.woff,.ttf,.otf">
            {(props) => (
              <Button {...props} variant="default">
                Choose font file
              </Button>
            )}
          </FileButton>
          <Text size="sm">{file ? file.name : 'No file chosen.'}</Text>
        </Group>
        {problem && (
          <Text size="sm" c="red" role="alert">
            {problem}
          </Text>
        )}
        <Group align="start">
          <TextInput
            label="Family"
            value={family}
            onChange={(event) => setFamily(event.currentTarget.value)}
            error={errors.family}
            disabled={!file}
            w={260}
          />
          <TextInput
            label="Weight"
            description="400, or a range such as 100-900 for a variable font"
            value={weight}
            onChange={(event) => setWeight(event.currentTarget.value)}
            error={errors.weight}
            disabled={!file}
            w={240}
          />
          <NativeSelect
            label="Style"
            data={STYLES}
            value={style}
            onChange={(event) => setStyle(event.currentTarget.value === 'italic' ? 'italic' : 'normal')}
            disabled={!file}
          />
        </Group>
        <Group>
          <Button type="submit" loading={isLoading} disabled={!file}>
            Upload font
          </Button>
        </Group>
        {error && <Alert color="red">{problemWith(error)}</Alert>}
      </Stack>
    </form>
  );
}
