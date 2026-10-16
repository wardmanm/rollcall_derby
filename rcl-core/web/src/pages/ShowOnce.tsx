import { Button, CopyButton, Group, Modal, Stack, Text, TextInput } from '@mantine/core';

/** A secret the server sends once, such as a temporary password or an API key, and how to present it. */
export interface ShownOnce {
  title: string;
  /** What to do with it, said before it's gone. */
  text: string;
  label: string;
  value: string;
}

// A secret shown once (ADR-0018, ADR-0020): the server never sends it again. Copying needs a secure page (HTTPS or
// localhost), which the venue network often isn't, so the secret is also selectable in its own box.
export function ShowOnce({ shown, onClose }: { shown: ShownOnce | null; onClose: () => void }) {
  const canCopy = window.isSecureContext && 'clipboard' in navigator;
  return (
    <Modal opened={shown !== null} onClose={onClose} title={shown?.title ?? ''}>
      {shown && (
        <Stack>
          <Text>{shown.text}</Text>
          <Group align="end" wrap="nowrap">
            <TextInput
              label={shown.label}
              value={shown.value}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              styles={{ input: { fontFamily: 'monospace' } }}
              flex={1}
            />
            {canCopy && (
              <CopyButton value={shown.value}>
                {({ copied, copy }) => <Button onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>}
              </CopyButton>
            )}
          </Group>
          <Button onClick={onClose}>Done</Button>
        </Stack>
      )}
    </Modal>
  );
}
