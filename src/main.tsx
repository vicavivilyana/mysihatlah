import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './index.css';
import App from './App';
import { AuthProvider } from './store/auth';
import { armPending } from './lib/notifications';
import { PREVIEW_MODE } from './lib/previewMode';

// Reserve room for the fixed preview banner (see body.preview-mode in index.css).
if (PREVIEW_MODE) document.body.classList.add('preview-mode');

// Re-arm any near-term reminders that were scheduled before the app was closed.
armPending();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
