import express from 'express';
import { configuredApp } from '../../../agents-service/src/config.mjs';

if (!Deno.env.get('TASKLY_FIREBASE_SERVICE_ACCOUNT') && !Deno.env.get('FIRESTORE_EMULATOR_HOST')) {
  throw new Error('Configura TASKLY_FIREBASE_SERVICE_ACCOUNT como secreto del servidor.');
}
const app = express();
// Supabase forwards /taskly-agents/*; the shared API keeps its original routes.
app.use('/taskly-agents', configuredApp({ preferRest: true }));
app.listen(3000);
