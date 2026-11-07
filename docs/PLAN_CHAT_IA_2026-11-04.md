# Plan: proyectos para IAs en Taskly web

## Objetivo

Conectar dos instancias de OpenCode, con DeepSeek u otro modelo compatible con herramientas, mediante salas de proyecto visibles en Taskly web. Cada agente puede consultar/publicar contexto, preguntar a otro y responder con trazabilidad. El APK no cambia.

## Alcance y decisiones

- Reutilizar Firebase Auth, Firestore, diseño y componentes web existentes.
- Separar los proyectos de agentes de los chats personales y limitar sus credenciales a un único proyecto.
- Servicio MCP remoto por HTTP; configuración OpenCode con token en variable de entorno. Los tokens se muestran una sola vez y se guardan únicamente como hash en el servidor.
- Contexto por documento con versión esperada; rechazar sobrescrituras concurrentes. Mensajes y preguntas con identificador idempotente, destinatario y estado.
- Conector opcional para OpenCode que atiende preguntas con una sesión dedicada y herramientas limitadas al contexto de Taskly. El contexto privado de otra sesión y el control de las VMs no se comparten automáticamente.
- Validar proyecto, agente, revocación, entradas, límites de mensajes, conflictos, reintentos y permisos en el servicio.

## Pasos

1. [Completado] Revisar arquitectura, compatibilidad MCP/OpenCode y disponibilidad del servidor Firebase; conservar cambios existentes.
2. [Completado] Implementar repositorio del servicio, autenticación, endpoints MCP y cola con recepción/respuesta idempotente.
3. [Completado] Implementar salas web, agentes, contexto versionado, conversación y configuración de conexión OpenCode.
4. [Completado] Implementar el conector de recepción de OpenCode y documentar su uso en las dos PC.
5. [Completado] Probar reglas, aislamiento de agentes/proyectos, dos clientes MCP, contexto concurrente, cola y conector; revisar interfaz en navegador.
6. [Completado: Supabase] Proyecto independiente Taskly creado en la organización elegida, cotizado a $0/mes. Credencial exclusiva guardada como secreto. Servidor, reglas, índices y web publicados. Verificados dos clientes MCP reales por HTTPS, autenticación, contexto, pregunta/respuesta, revocación y creación de proyecto/contexto desde la web pública sin recargar.

## Criterios de finalización

- El propietario crea un proyecto y dos agentes desde la web.
- Dos conexiones MCP independientes intercambian pregunta y respuesta; la web recibe los cambios en vivo.
- El contexto conserva autor, fecha y versiones; un conflicto no destruye datos.
- Un agente revocado o de otro proyecto no puede leer ni escribir.
- Reintentar una solicitud o una respuesta no la duplica.
- El conector automático solo consulta el contexto compartido, tiene espera y límites y no responde indefinidamente a otros agentes.
- Los chats normales y las listas de música siguen pasando sus pruebas.

## Requisito externo confirmado

Firebase informa `billingEnabled=false` para `tasksv`. Cloud Functions requiere Blaze. Se consultó al usuario si habilitará Blaze, usará un servidor HTTPS propio o prefiere dejarlo preparado localmente. No se activó facturación ni se publicó un endpoint inexistente.

El usuario eligió Supabase y autorizó el proyecto independiente **Taskly**, referencia `pyzccxqovozizipamrvu`, en **RonaldArc503's Org**, región `us-east-1`. Supabase cotizó su creación a $0/mes. Se eliminaron las rutas y el despliegue de Cloud Functions; Firebase sigue almacenando los datos y autenticando a los usuarios. La credencial se guardó desde el navegador autorizado en Supabase Secrets: no fue necesario obtener un token personal del usuario ni iniciar sesión en la CLI.

## Entrega local

Guía de conexión, pruebas y publicación: [CHAT_IA_2026-11-04.md](./CHAT_IA_2026-11-04.md). Pruebas del servicio, 41 pruebas web y 51 comprobaciones de reglas aprobadas. Compilación y análisis estático aprobados; pregunta/respuesta MCP visible en la web sin recargar. Pendiente fuera de la validación disponible: OpenCode/DeepSeek real en ambas PC.

Adaptación Supabase: seis pruebas aprobadas contra el servicio en Deno con transporte REST, emuladores y un proxy local de pruebas que conserva el encabezado de administrador del emulador. Incluyen preguntas/respuestas MCP, permisos, revocación, concurrencia, reintentos y conector con prefijo de función. El transporte MCP final usa la API Fetch estándar para evitar las diferencias del adaptador HTTP de Node en Edge; las seis pruebas volvieron a aprobar. También se comprobó el servidor público y se eliminaron las cuentas y proyectos ficticios de todas las pruebas.
