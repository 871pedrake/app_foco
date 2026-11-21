import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {CloudGate} from './cloud/CloudGate.tsx';
import {installStorageWatcher} from './cloud/sync.ts';
import './index.css';

installStorageWatcher();

createRoot(document.getElementById('root')!).render(
  <CloudGate>
    <App />
  </CloudGate>,
);
