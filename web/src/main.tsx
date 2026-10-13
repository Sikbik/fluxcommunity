import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/utilities.css';
import { startDataLayer } from '@/data';
import App from './app/App';
import { bootDocument } from './app/shell';

// Attributes the CSS keys off (accent, motion, glass) are right before the first render.
bootDocument();

// The data layer starts once, for the whole page. It feeds the stores and the stage bus.
startDataLayer();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
