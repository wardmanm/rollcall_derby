import './overlay.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { io } from 'socket.io-client';
import { introIdFromPath } from './intro-path.ts';
import { OverlayApp } from './OverlayApp.tsx';
import { makeOverlayStore, OVERLAY_NAMESPACE } from './live.ts';

// An intro's page (/producer/overlay/intros/<id>) asks the server for that intro's theme and state.
const introId = introIdFromPath(window.location.pathname);
const store = makeOverlayStore(() => io(OVERLAY_NAMESPACE, introId ? { auth: { intro: introId } } : {}));

createRoot(document.getElementById('overlay')!).render(
  <StrictMode>
    <Provider store={store}>
      <OverlayApp introId={introId} />
    </Provider>
  </StrictMode>,
);
