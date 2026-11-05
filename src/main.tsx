import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { startPalette } from './lib/palette-look';
import { installSessionHeader } from './lib/session';

//Before anything talks to the server: every same origin fetch says whose session it is
installSessionHeader();

//The starter look comes from the shared StudyDesk palette: ask for it now
void startPalette();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
