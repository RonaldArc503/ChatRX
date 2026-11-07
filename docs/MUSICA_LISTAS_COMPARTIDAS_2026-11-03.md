# Listas compartidas: web y Android

La web incorpora únicamente la página de lista compartida; no añade un módulo completo de música.

## Recorrido

1. El APK actualizado comparte `https://tasksv.web.app/musica/lista/<token>`.
2. Android puede asociar el dominio con Taskly mediante App Links. Si se abre en el navegador, Firebase Hosting sirve la página de lista.
3. Si no hay sesión, se reutiliza `AuthView` en la misma dirección. Al entrar, el usuario ve la portada, el nombre y todas las canciones, sin perder el enlace.
4. Guardar crea `users/<uid>/playlists/shared_<token>`, con sus canciones bajo `tracks` y `copiedFromShareId` como procedencia. No se conservan los campos que apuntaban a la lista original. Es el mismo esquema que Android: copia editable e independiente, guardado por transacciones y sin duplicados. El propietario no crea una copia de su propia lista.
5. La vista del enlace observa el original en vivo. Las copias guardadas no siguen sus cambios y se conservan aunque desaparezca el original. Un enlace eliminado, retirado o inaccesible muestra un mensaje y permite reintentar. La reproducción se ofrece mediante Abrir en Taskly; esta página no reproduce ni descarga canciones en el navegador.

El botón Abrir en Taskly utiliza un intent de Android con retorno a la dirección HTTPS cuando el navegador lo admite. En escritorio mantiene el esquema `taskly://playlist/...`. Android sigue aceptando esos enlaces antiguos.

## Archivos

- `src/pages/musica/lista.astro`: entrada estática y presentación inicial.
- `src/components/music/SharedPlaylistPage.tsx`: autenticación y estado de la página.
- `src/components/music/SharedPlaylistContent.tsx`: portada, canciones y guardado. No muestra etiquetas de lista compartida o solo lectura; la confirmación aparece durante tres segundos y luego desaparece.
- `src/lib/sharedPlaylists.ts`: observadores y guardado, separados de la interfaz. `sharedPlaylistCopy.ts` copia en bloques de 400 documentos, protege cada intento contra escrituras concurrentes y publica el estado editable solo al terminar.
- `src/lib/sharedPlaylistModel.ts`: identificadores, validación de datos y enlace a Android.
- `firebase.json`: reescritura del token a la página estática y cabecera del archivo de asociación.
- `public/.well-known/assetlinks.json`: asociación para los certificados debug y release de Taskly. La huella release se comprobó contra el APK firmado y el APK instalado en el Honor. Para distribuir con otro certificado hay que añadir su huella SHA-256; no incluir claves privadas.
- `public/sw.js`: almacena cada navegación bajo su propia dirección para impedir que una visita a la lista sobrescriba el HTML de inicio en caché.
- `firestore.rules`: conserva las reglas anteriores e incluye los permisos de música que ya se utilizan en producción. No se desplegaron nuevas reglas durante esta integración.

## Desarrollo y pruebas

```powershell
npm run test:music-shared
npm run check
npm run build
```

Los emuladores de prueba usan exclusivamente `demo-taskly-music`, con Auth en 9098 y Firestore en 8088. La prueba de integración exige explícitamente la dirección local:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088'
node --experimental-strip-types --test src/lib/sharedPlaylists.emulator.test.mjs
```

Para la revisión visual con datos locales:

```powershell
$env:PUBLIC_FIREBASE_EMULATORS = '1'
npm run dev -- --host 127.0.0.1 --port 4321 --background
```

Esa opción solo existe en modo desarrollo, cambia el proyecto a `demo-taskly-music`, conecta ambos emuladores y desactiva Analytics. No se habilita mediante parámetros del enlace ni se activa en el build de producción. El middleware refleja localmente la reescritura que Firebase Hosting realiza en producción. También se admite `/musica/lista/?id=<token>` para una previsualización estática local.

## Publicación y validación

- Publicado en `https://tasksv.web.app` y `https://tasksv.firebaseapp.com`.
- Se publica mediante Firebase Hosting con la configuración del proyecto. No se modifican las reglas de producción al desplegar la web.
- Ambas direcciones de lista y ambos archivos `assetlinks.json` devolvieron HTTP 200. Los archivos de asociación se sirven como `application/json`.
- 8 pruebas de modelos y hosting y 1 prueba de integración con repositorios reales aprobaron. La integración se ejecutó con las reglas Android y las reglas web locales.
- `astro check`: 0 errores, con avisos informativos anteriores en chat/guardados. `astro build`: correcto.
- Navegador: inicio de sesión en la misma dirección, lista completa, guardado, persistencia al recargar y mensaje de lista inexistente. Revisión visual a 390 px de ancho con datos ficticios locales.
- Android: `testDebugUnitTest`, `assembleDebug` y `assembleDebugAndroidTest` correctos (110 pruebas unitarias: 105 aprobadas y 5 opcionales omitidas). El sistema verificó ambos dominios y la huella del APK instalado.
- La ejecución de la prueba de apertura directa en el emulador fue rechazada por la revisión automática con «blocked by policy». No se forzaron las preferencias de enlaces del dispositivo; la verificación del dominio se consultó en modo lectura. Si un teléfono abre el navegador, la página y el botón Abrir en Taskly siguen disponibles. La elección de aplicación puede depender de las preferencias de enlaces del teléfono.

No hubo commit ni push. Instalar el APK actualizado y volver a compartir una lista genera la nueva dirección HTTPS; los mensajes antiguos ya enviados no cambian automáticamente.

## Independencia de las copias

Las transacciones conservan una sola copia por enlace y usuario. Una copia terminada nunca se sobrescribe al guardar de nuevo. Si ya existía una referencia antigua o un intento parcial, se convierte en el mismo documento. Los identificadores de las canciones usan SHA-256 igual que Android, por lo que Agregar a lista sigue evitando canciones duplicadas. La copia elimina el `shareId` del original: si después se comparte, recibe un enlace propio.

La integración prueba edición independiente, dos guardados concurrentes, más de 500 canciones, recuperación de una copia interrumpida, eliminación del original y ausencia de duplicados. El navegador confirmó la aparición y desaparición del aviso a los tres segundos.
