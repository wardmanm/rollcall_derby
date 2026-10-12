import { Button, CopyButton, Group, Modal, Stack, Text, TextInput } from '@mantine/core';

export interface ShownPassword {
  username: string;
  password: string;
}

// A temporary password, shown once (ADR-0018): the server never sends it again. Copying needs a secure page (HTTPS or
// localhost), which the venue network often isn't, so the password is also selectable in its own box.
export function TemporaryPassword({ shown, onClose }: { shown: ShownPassword | null; onClose: () => void }) {
  const canCopy = window.isSecureContext && 'clipboard' in navigator;
  return (
    <Modal opened={shown !== null} onClose={onClose} title={`Temporary password for ${shown?.username ?? ''}`}>
      {shown && (
        <Stack>
          <Text>
            Give it to {shown.username} now: it won&apos;t be shown again. They&apos;ll choose their own password when
            they sign in.
          </Text>
          <Group align="end" wrap="nowrap">
            <TextInput
              label="Temporary password"
              value={shown.password}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              styles={{ input: { fontFamily: 'monospace' } }}
              flex={1}
            />
            {canCopy && (
              <CopyButton value={shown.password}>
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
