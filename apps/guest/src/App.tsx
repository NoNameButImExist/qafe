import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Message } from './components/Message';
import { venueQuery, sessionQuery } from './lib/queries';
import { JoinScreen } from './screens/JoinScreen';
import { LandingScreen } from './screens/LandingScreen';
import { SessionScreen } from './screens/SessionScreen';

const TABLE_PATH = /^\/t\/([A-Za-z0-9_-]{16,64})\/?$/;

/**
 * Two addresses: /t/<token> (the QR code) joins the table and moves on to /, which shows
 * the table session, or the menu to browse when the device is not at a table.
 */
export function App() {
  const [token, setToken] = useState(() => TABLE_PATH.exec(window.location.pathname)?.[1] ?? null);

  if (token) {
    return (
      <JoinScreen
        token={token}
        onDone={() => {
          window.history.replaceState(null, '', '/');
          setToken(null);
        }}
      />
    );
  }
  return <Home />;
}

function Home() {
  const { t } = useTranslation();
  const venue = useQuery(venueQuery);
  const session = useQuery(sessionQuery);

  if (venue.isPending || session.isPending) return <Message loading title={t('common.loading')} />;
  if (venue.isError) return <Message title={t('errors.not_found')} />;
  if (session.isError) {
    return (
      <Message
        title={t('errors.unknown')}
        action={{ label: t('common.retry'), onClick: () => void session.refetch() }}
      />
    );
  }
  if (!session.data) return <LandingScreen venue={venue.data} />;
  return <SessionScreen venue={venue.data} state={session.data} />;
}
