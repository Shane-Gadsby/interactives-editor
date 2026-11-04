import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { startPalette } from './lib/palette-look';

//The starter look comes from the shared StudyDesk palette: ask for it now
void startPalette();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
