import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { initializeFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createApp } from './app.mjs';

export function configuredApp({ preferRest = false } = {}) {
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
    ...(process.env.TASKLY_FIREBASE_SERVICE_ACCOUNT ? { credential: cert(JSON.parse(process.env.TASKLY_FIREBASE_SERVICE_ACCOUNT)) } : {}) });
  const allowedOrigins = process.env.TASKLY_WEB_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean)
    ?? ['https://tasksv.web.app', 'https://tasksv.firebaseapp.com'];
  return createApp({ db: initializeFirestore(getApps()[0], { preferRest }), auth: getAuth(), allowedOrigins });
}
