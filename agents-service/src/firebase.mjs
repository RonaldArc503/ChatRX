import { onRequest } from 'firebase-functions/v2/https';
import { configuredApp } from './config.mjs';
export const agentsApi = onRequest({ region: 'us-central1', maxInstances: 2, minInstances: 0,
  memory: '256MiB', timeoutSeconds: 60, cors: false, invoker: 'public' }, configuredApp());
