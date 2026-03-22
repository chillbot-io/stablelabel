import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { msalConfig } from '@/lib/msal-config';
import './index.css';

const msalInstance = new PublicClientApplication(msalConfig);

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

msalInstance
  .initialize()
  .then(() => msalInstance.handleRedirectPromise())
  .then(() => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </React.StrictMode>,
    );
  })
  .catch((err) => {
    root.innerHTML = `<div style="padding:2rem;color:#ef4444;font-family:system-ui">
      <h1>Authentication Error</h1>
      <p>${err instanceof Error ? err.message : 'Failed to initialize authentication'}</p>
    </div>`;
  });
