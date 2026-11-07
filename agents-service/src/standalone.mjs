import { configuredApp } from './config.mjs';
configuredApp().listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('Taskly agentes: servicio iniciado.'));
