import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyTheme, readThemeId } from './lib/themes';
applyTheme(readThemeId());
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
