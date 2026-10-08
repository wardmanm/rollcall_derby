import './overlay.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { OverlayApp } from './OverlayApp.tsx';
import { makeOverlayStore } from './live.ts';

createRoot(document.getElementById('overlay')!).render(
  <StrictMode>
    <Provider store={makeOverlayStore()}>
      <OverlayApp />
    </Provider>
  </StrictMode>,
);
