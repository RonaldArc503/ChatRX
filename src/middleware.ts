import { defineMiddleware } from "astro:middleware";

// Firebase Hosting serves this rewrite in production; mirror it for local development.
export const onRequest = defineMiddleware((context, next) => {
  const path = context.url.pathname;
  if (import.meta.env.DEV && path.startsWith("/musica/lista/") && path !== "/musica/lista/")
    return context.rewrite("/musica/lista/");
  return next();
});
