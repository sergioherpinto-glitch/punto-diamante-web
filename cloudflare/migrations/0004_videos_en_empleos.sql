-- Empleos también admite videos (hasta 6, como Mercadería y Servicios): nueva columna
-- "videos" (lista JSON de rutas /videos/...). Los avisos que ya existen quedan con lista vacía.
alter table empleos add column videos text not null default '[]';
