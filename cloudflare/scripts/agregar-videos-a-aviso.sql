-- Agregar videos a mano al aviso del cárdigan (m-1792032049643-724a6f),
-- que es antiguo y no tiene llave, así que no se edita desde el celular.
--
-- PASO 1: subir cada video (máx. 25 MB, hasta 6). Ejemplo en la terminal:
--   curl -X POST https://confecciones-peru.puntodiamante.workers.dev/api/videos -H "content-type: video/mp4" --data-binary @C:\ruta\video1.mp4
-- Cada subida responde algo como {"url":"/videos/1792000000000-abc123.mp4"}. Copia esa ruta.
--
-- PASO 2: pegar las rutas aquí abajo (reemplaza los dos ejemplos) y ejecutar:
--   cf d1 query 027f4e2b-cd20-40b5-994e-a7c3c4a81d5d --sql "<las dos líneas de abajo>"
-- "videos" es la lista completa; "video" es solo el primero (compatibilidad).

update mercaderia
set videos = '["/videos/EJEMPLO-1.mp4","/videos/EJEMPLO-2.mp4"]',
    video = '/videos/EJEMPLO-1.mp4'
where id = 'm-1792032049643-724a6f';
