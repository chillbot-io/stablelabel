import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { msalConfig } from '@/lib/msal-config';
import './index.css';

const msalInstance = new PublicClientApplication(msalConfig);

// Handle redirect promise on page load (MSAL redirect flow)
msalInstance.initialize().then(() => {
  msalInstance.handleRedirectPromise().then(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </React.StrictMode>,
    );
  });
});
