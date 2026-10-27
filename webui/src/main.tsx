import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App';
import { applyTheme } from './lib/theme';
import { transitions } from './lib/animation';
import './style.css';

applyTheme();
createRoot(document.getElementById('app')!).render(
  <MotionConfig reducedMotion="user" transition={transitions.standard}>
    <App />
  </MotionConfig>,
);
