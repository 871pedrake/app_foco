import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

function createDb(): Firestore {
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  try {
    return initializeFirestore(
      firebaseApp,
      { localCache: persistentLocalCache() },
      databaseId,
    );
  } catch {
    return getFirestore(firebaseApp, databaseId);
  }
}

export const db = createDb();

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}
