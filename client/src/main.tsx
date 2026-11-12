import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DemoRoleProvider } from './context/DemoRoleContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoRoleProvider>
      <App />
    </DemoRoleProvider>
  </React.StrictMode>
);
