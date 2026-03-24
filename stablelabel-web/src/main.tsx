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
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding:2rem;color:#ef4444;font-family:system-ui';
    const h1 = document.createElement('h1');
    h1.textContent = 'Authentication Error';
    const p = document.createElement('p');
    p.textContent = err instanceof Error ? err.message : 'Failed to initialize authentication';
    wrapper.append(h1, p);
    root.replaceChildren(wrapper);
  });
