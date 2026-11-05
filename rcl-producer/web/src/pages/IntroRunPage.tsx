import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert, Anchor, Badge, Button, Group, Stack, Text, Title } from '@mantine/core';
import type { IntroTeamSlot } from '@rollcall/producer-contract';
import { apiError, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
import {
  useClearIntroMutation,
  useGetIntroQuery,
  useGetIntroRunQuery,
  useGetTeamsQuery,
  useNextIntroMutation,
  useStartIntroMutation,
} from '../api.ts';

// The control page for one intro (docs/features/skater-intros.md), made for a phone: start a team, press Next as each
// person is called, Clear when done. The server decides what happens; this page shows the state it last sent.
export function IntroRunPage() {
  const { data: me } = useGetMeQuery();
  const { id = '' } = useParams();
  if (!me?.permissions.includes('producer:intros.run')) {
    return <Alert color="gray">Your account can't run intros.</Alert>;
  }
  return <IntroControls id={id} />;
}

const isNotFound = (error: unknown) => apiError(error)?.code === 'not_found';

function IntroControls({ id }: { id: string }) {
  const intro = useGetIntroQuery(id);
  const teams = useGetTeamsQuery();
  const live = useGetIntroRunQuery(id, { refetchOnFocus: true }); // a phone that slept catches up on return
  const [start] = useStartIntroMutation();
  const [next] = useNextIntroMutation();
  const [clear] = useClearIntroMutation();
  const [problem, setProblem] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const now = useNow(live.data?.run.timerMsLeft != null);

  const gone = deleted || isNotFound(live.error) || isNotFound(intro.error);
  const view = live.data;

  // Runs one action; the new state arrives in the cache by itself.
  const act = async (action: () => Promise<{ error?: unknown }>) => {
    const result = await action();
    if (!result.error) return setProblem(null);
    if (isNotFound(result.error)) setDeleted(true);
    else setProblem(problemWith(result.error));
  };

  const nameOf = (slot: IntroTeamSlot) => {
    const teamId = slot === 'a' ? intro.data?.teamAId : intro.data?.teamBId;
    const team = teamId ? teams.data?.find((candidate) => candidate.id === teamId) : undefined;
    return { team, label: team ? `Start ${team.name}` : `Start team ${slot.toUpperCase()}` };
  };

  const connected = !!view?.connected && !gone;
  const run = view?.run;
  const startButton = (slot: IntroTeamSlot) => {
    const { team, label } = nameOf(slot);
    return (
      <Button
        key={slot}
        size="lg"
        variant="light"
        style={{ flex: '1 1 10rem' }}
        disabled={!connected || !team}
        onClick={() => void act(() => start({ id, team: slot }))}
      >
        {label}
      </Button>
    );
  };

  const secondsLeft =
    view && run?.timerMsLeft != null
      ? Math.max(0, Math.ceil((run.timerMsLeft - (Math.max(now, view.receivedAt) - view.receivedAt)) / 1000))
      : null;

  return (
    <Stack maw={560} gap="md">
      <Title order={2}>{intro.data?.name ?? 'Intro'}</Title>
      {gone && (
        <Alert color="red">
          <Text>This intro was deleted.</Text>
          <Anchor component={Link} to="/intros">
            Intros
          </Anchor>
        </Alert>
      )}
      {!gone && live.isError && <Alert color="red">{problemWith(live.error)}</Alert>}
      {!gone && view && !view.connected && (
        <Alert color="yellow">Reconnecting… The buttons come back when the connection does.</Alert>
      )}
      {problem && !gone && <Alert color="red">{problem}</Alert>}

      <Group grow gap="sm">
        {startButton('a')}
        {startButton('b')}
      </Group>

      <Button
        size="xl"
        h={96}
        fullWidth
        disabled={!connected || !run || run.team === null || run.done}
        onClick={() => run && void act(() => next({ id, revision: run.revision }))}
      >
        {run?.done ? 'Team done' : 'Next'}
      </Button>

      {run?.title && <Text fw={600}>Title card is up</Text>}
      {secondsLeft !== null && <Text c="dimmed">{`Next in ${secondsLeft} s`}</Text>}

      {run && run.people.length > 0 && (
        <Stack gap="xs" component="ul" p={0} m={0} style={{ listStyle: 'none' }}>
          {run.people.map((person) => (
            <Group key={person.id} component="li" justify="space-between" wrap="nowrap">
              <Text>
                <Text span fw={700} mr="sm">
                  {person.number}
                </Text>
                {person.name}
              </Text>
              {run.onScreen.includes(person.id) ? (
                <Badge color="green">On screen</Badge>
              ) : run.next === person.id ? (
                <Badge color="blue">Next</Badge>
              ) : null}
            </Group>
          ))}
        </Stack>
      )}

      <Group mt="xl" pt="xl" justify="center">
        <Button variant="subtle" color="red" disabled={!connected} onClick={() => void act(() => clear({ id }))}>
          Clear
        </Button>
      </Group>
    </Stack>
  );
}

// The time, ticking every 250 ms while `running`. Counting from when this phone received a state keeps its own clock's
// error out of the countdown.
function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = running ? setInterval(() => setNow(Date.now()), 250) : undefined;
    return () => clearInterval(timer);
  }, [running]);
  return now;
}
