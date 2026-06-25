import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ManualOverrideProvider } from './context/ManualOverrideContext';
import { AlertProvider } from './context/AlertContext';
import { EngineProvider } from './context/EngineContext';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ManualOverrideProvider>
        <AlertProvider>
          <EngineProvider>
            <App />
          </EngineProvider>
        </AlertProvider>
      </ManualOverrideProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
