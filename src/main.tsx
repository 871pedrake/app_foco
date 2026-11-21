import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import {CloudGate} from './cloud/CloudGate.tsx';
import {installStorageWatcher} from './cloud/sync.ts';
import './index.css';

if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
) {
  registerSW({immediate: true});
}

installStorageWatcher();

createRoot(document.getElementById('root')!).render(
  <CloudGate>
    <App />
  </CloudGate>,
);
