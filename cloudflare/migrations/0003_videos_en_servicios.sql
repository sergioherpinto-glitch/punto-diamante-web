-- Servicios también admite videos (hasta 6, como Mercadería): nueva columna "videos"
-- (lista JSON de rutas /videos/...). Los avisos que ya existen quedan con lista vacía.
alter table servicios add column videos text not null default '[]';
