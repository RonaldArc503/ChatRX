# Plan de paridad: Taskly web y Android

## Propósito

Completar la aplicación web de Taskly en `C:\Users\HP VICTUS\Desktop\Taskly` tomando como referencia funcional la aplicación Android ubicada en `C:\Users\HP VICTUS\Desktop\TasklyApp`.

Este documento es un diagnóstico y plan de implementación. No propone reemplazar lo que ya funciona en la web, sino completar las funciones que Android ya posee y mantener ambos clientes compatibles con el mismo proyecto Firebase.

## Estado actual de la web

La web ya es una aplicación funcional construida con Astro, Preact, Firebase y PWA. Incluye:

- Autenticación y perfil básico.
- Tareas con columnas, cambios de estado, eliminación y limpieza de completadas.
- Chat individual y grupal, presencia, indicador de escritura, reacciones, respuestas, reenvío, mensajes fijados, adjuntos y visor de medios.
- Mensajes guardados con filtros, fijado, copiado y eliminación.
- Recordatorios con comprobantes de imagen o PDF.
- Conversor con búsqueda de YouTube y entrada manual de URL.
- Reproductor de audio básico para adjuntos.
- Modo oscuro, funcionamiento offline básico, Service Worker y manifest PWA.

La revisión estática terminó correctamente con `npm run check`.

## Diferencias frente a Android

### Productividad

1. **Edición de tareas**
   - Android permite editar el título de una tarea.
   - La web permite crear, mover y eliminar, pero no editar.

2. **Recordatorios avanzados**
   - Android permite fecha, hora opcional, repetición diaria/semanal/mensual, completar, restaurar, editar y alarmas locales.
   - La web permite crear, modificar la fecha, reiniciar mensualmente, adjuntar comprobantes y eliminar, pero no cubre la repetición, el estado completado ni notificaciones reales.

3. **Copia y pega**
   - Android tiene una bandeja para textos, enlaces y códigos con bloques temporales o permanentes.
   - La web no cuenta con esta herramienta.

### Chat y contenido guardado

4. **Búsqueda global de mensajes**
   - Android posee una pantalla de búsqueda global y un índice privado por usuario.
   - La web permite buscar contactos para iniciar chat, pero no buscar mensajes entre conversaciones.

5. **Detalle de conversación**
   - Android ofrece una pantalla de información del chat con contenido multimedia compartido y acciones relacionadas.
   - La web administra grupos, pero no ofrece una vista de detalle equivalente para todos los chats.

6. **Notas de voz**
   - Android puede grabar y enviar notas de voz.
   - La web admite archivos de audio adjuntos, pero no graba desde el micrófono.

7. **Guardados mejorados**
   - Android incorpora búsqueda de texto, orden, navegación al mensaje original y vista de adjuntos.
   - La web ya tiene filtros, fijado, copiado y borrado; le faltan búsqueda, orden y navegación al origen.

### Música, configuración y conversor

8. **Biblioteca de música**
   - Android tiene canciones descargadas, listas, reproductor de pantalla completa, cola, repetición, aleatorio, temporizador y efectos visuales.
   - La web solo tiene un reproductor compacto para audio del chat.

9. **Configuración**
   - Android cuenta con pantalla de configuración para tema y descargas automáticas.
   - La web tiene cambio de tema, pero no una sección de configuración ni control de política de caché multimedia.

10. **Conversor con ciclo completo**
    - Android muestra estados de la conversión y descarga, historial, reproducción, eliminación y guardado en mensajes; también conserva un fallback visible.
    - La web presenta un conversor, pero no tiene un flujo propio y verificable de progreso, historial, descarga completada y fallback.

11. **URL compartida hacia el conversor**
    - Android recibe URL mediante Share Sheet y abre el conversor sin iniciar la descarga automáticamente.
    - La web aún no implementa Web Share Target para la PWA instalada.

## Riesgo crítico: Firebase compartido

La web y Android usan el proyecto Firebase `tasksv`. Sin embargo, sus archivos de reglas de Firestore son diferentes.

- La web usa reglas en `firestore.rules` enfocadas en tareas, perfiles, presencia y conversaciones.
- Android incluye además reglas para índices de búsqueda global y otros contratos de datos.

Desplegar las reglas actuales desde cualquiera de los dos proyectos puede eliminar permisos que el otro cliente necesita. Antes de añadir pantallas o datos nuevos, se debe establecer un contrato Firebase único, versionado y probado.

## Plan de implementación

### Fase 0: contrato compartido y seguridad

1. Comparar los modelos de Firestore usados por ambos clientes.
2. Consolidar `firestore.rules` e índices en una fuente de verdad compartida.
3. Mantener los datos privados del usuario bajo `users/{uid}`.
4. Mantener reglas basadas en participantes para conversaciones, mensajes, presencia y escritura.
5. Proteger los índices de búsqueda para que cada usuario solo pueda leer sus propios resultados.
6. Probar las reglas con Firebase Emulator antes de cualquier despliegue.

Resultado esperado: la web y Android pueden usar el mismo proyecto y las mismas colecciones sin romper rutas ni permisos del otro cliente.

### Fase 1: completar tareas y recordatorios

1. Añadir edición de título de tarea en la web.
2. Extender el modelo de recordatorio con:
   - `isCompleted`.
   - `hasTime`.
   - `repeatType`: ninguno, diario, semanal y mensual.
3. Incorporar acciones de completar, restaurar, editar y reprogramar.
4. Migrar de forma compatible los recordatorios ya existentes que no tengan los nuevos campos.
5. Solicitar permiso de notificaciones solo cuando el usuario active avisos.
6. Mostrar claramente la limitación del navegador: las notificaciones web en segundo plano no tienen la misma garantía que las alarmas nativas de Android.

Resultado esperado: tareas y recordatorios con funciones equivalentes en ambos clientes, respetando las limitaciones de una PWA.

### Fase 2: bandeja “Copia y pega”

1. Crear una vista accesible desde Perfil.
2. Permitir pegar texto y guardarlo inmediatamente.
3. Implementar dos modos:
   - Temporal: disponible solo durante la sesión actual.
   - Permanente: sincronizado en `users/{uid}/clipboardBlocks`.
4. Incluir copia al tocar la tarjeta, eliminación, confirmación visible y control `Ver completo` para texto largo.
5. Usar la API del portapapeles del navegador con mensajes claros si el permiso no está disponible.

Resultado esperado: la utilidad directa “pego y se guarda” se comporta igual que en Android, con sincronización de los bloques permanentes.

### Fase 3: paridad de chat y guardados

1. Crear índice y pantalla de búsqueda global de mensajes.
2. Mostrar resultado, conversación, fecha y fragmento coincidente.
3. Abrir el chat y enfocar el mensaje original desde un resultado o guardado.
4. Añadir vista de detalle de chat con multimedia compartida, mensajes fijados y datos de grupo cuando corresponda.
5. Agregar búsqueda y opciones de orden en Mis guardados.
6. Implementar grabación de voz mediante `MediaRecorder`, con solicitud explícita de micrófono, indicador de grabación, cancelar y enviar.
7. Verificar estados de lectura y compatibilidad de mensajes entre web y Android antes de exponerlos visualmente.

Resultado esperado: el contenido de chat puede encontrarse, abrirse y reutilizarse desde cualquier cliente.

### Fase 4: música y configuración

1. Crear una vista de Música desde Perfil.
2. Reutilizar el reproductor web existente para construir cola, lista actual, anterior/siguiente, repetición y reproducción aleatoria.
3. Incorporar playlists sincronizadas con el esquema compartido.
4. Añadir temporizador de apagado de reproducción mientras la pestaña esté activa.
5. Crear Configuración con tema y preferencia de caché/descarga automática de multimedia.
6. Reutilizar el Service Worker actual para caché de Cloudinary, respetando límites de cuota, conexión y preferencias del usuario.

Resultado esperado: la web ofrece biblioteca y reproducción organizada sin simular capacidades nativas que el navegador no puede garantizar.

### Fase 5: conversor y recepción de URLs compartidas

1. Definir un contrato único con el backend autorizado de conversión.
2. Mostrar desde el primer clic: estado, progreso, error y resultado final.
3. Confirmar la descarga mediante un archivo realmente disponible, no solo por la aceptación de una solicitud.
4. Añadir historial de conversiones, reproducción, eliminación y opción de guardar en mensajes.
5. Conservar el proveedor alternativo como acción visible, nunca como cambio silencioso.
6. Implementar Web Share Target para que una PWA instalada reciba una URL y la coloque en el campo del conversor sin iniciar el proceso automáticamente.

Resultado esperado: el conversor informa lo que ocurre y se comporta de forma coherente entre navegador y Android.

## Orden recomendado

1. Fase 0: contrato Firebase y reglas.
2. Fase 1: tareas y recordatorios.
3. Fase 2: Copia y pega.
4. Fase 3: búsqueda, guardados y notas de voz.
5. Fase 4: Música y configuración.
6. Fase 5: conversor y Share Target.

Las tres primeras fases forman la primera entrega recomendada: eliminan el riesgo de incompatibilidad de Firebase y completan las herramientas de productividad más directas.

## Validación requerida

- `npm run check` y `npm run build` en la web.
- Pruebas de reglas y datos mediante Firebase Emulator.
- Pruebas cruzadas web/Android con la misma cuenta: crear, modificar y eliminar tareas, recordatorios, bloques permanentes, guardados y mensajes.
- Prueba real de conexión interrumpida y posterior sincronización.
- Prueba real de notificaciones web en navegador compatible y PWA instalada.
- Prueba de micrófono, adjuntos, reproducción y caché en navegador.
- Conversión completa hasta archivo disponible, con comprobación del fallback y manejo de error.

## Archivos de referencia

- Web: `src/components/AppRoot.tsx`
- Web: `src/components/TodoApp.tsx`
- Web: `src/components/reminders/RemindersView.tsx`
- Web: `src/components/chat/ConversationWindow.tsx`
- Web: `src/components/saved/SavedView.tsx`
- Web: `src/components/converter/ConverterView.tsx`
- Web: `firestore.rules`
- Android: `app/src/main/java/com/ronaldcolocho/taskly/ui/navigation/AppNavigation.kt`
- Android: `app/src/main/java/com/ronaldcolocho/taskly/ui/screen/clipboard/ClipboardShelfScreen.kt`
- Android: `app/src/main/java/com/ronaldcolocho/taskly/ui/screen/music/MusicScreens.kt`
- Android: `app/src/main/java/com/ronaldcolocho/taskly/ui/screen/reminders/RemindersScreen.kt`
- Android: `app/src/main/java/com/ronaldcolocho/taskly/ui/screen/chat/GlobalChatSearchScreen.kt`
