import { configuredApp } from './config.mjs';
if (!process.env.GCLOUD_PROJECT?.startsWith('demo-') || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('El modo local requiere proyecto demo y emuladores Auth/Firestore explícitos.');
}
configuredApp().listen(Number(process.env.PORT || 8787), '127.0.0.1', () => console.log('Taskly agentes local: http://127.0.0.1:8787'));
