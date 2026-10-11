-- Confecciones Perú — base de datos en Cloudflare D1 (SQLite).
-- Mismas tablas y columnas que tenía Supabase, para que la página no cambie.
-- Las listas (fotos, prendas, etc.) se guardan como texto JSON; los sí/no como 0/1.
-- llave_hash: huella de la "llave" secreta que recibe el celular que creó el
-- aviso. Sin esa llave no se puede editar ni borrar (antes cualquiera podía).

create table if not exists empleos (
  id text primary key,
  tipo text not null,
  perfiles text not null default '[]',
  prendas text not null default '[]',
  telas text not null default '[]',
  experiencia text not null default '',
  maquinas text not null default '[]',
  operaciones text not null default '[]',
  labor_manual text not null default '[]',
  tamano_taller text not null default '',
  modalidad_pago text not null default '[]',
  pago text not null default '',
  disponibilidad text not null default '[]',
  zona text not null,
  zonas_trabajo text not null default '[]',
  contacto text not null,
  whatsapp text not null,
  descripcion text not null default '',
  urgente integer not null default 0,
  documento text,
  documento_tipo text,
  fotos text not null default '[]',
  fecha integer not null,
  vence integer,
  destacado integer not null default 0,
  llave_hash text
);

create table if not exists mercaderia (
  id text primary key,
  tipo text not null,
  items text not null default '[]',
  tallas text not null default '[]',
  colores text not null default '[]',
  cantidad text not null default '',
  venta_tipo text not null default '',
  modalidad_venta text not null default '[]',
  precio_mayor text not null default '',
  precio_menor text not null default '',
  zona text not null,
  contacto text not null,
  whatsapp text not null,
  descripcion text not null default '',
  urgente integer not null default 0,
  fotos text not null default '[]',
  video text,
  documento text,
  documento_tipo text,
  fecha integer not null,
  vence integer,
  destacado integer not null default 0,
  llave_hash text
);

create table if not exists servicios (
  id text primary key,
  tipo text not null,
  tipos_servicio text not null default '[]',
  prendas text not null default '[]',
  capacidad text not null default '',
  zona text not null,
  precio text not null default '',
  contacto text not null,
  whatsapp text not null,
  descripcion text not null default '',
  urgente integer not null default 0,
  fotos text not null default '[]',
  documento text,
  documento_tipo text,
  fecha integer not null,
  vence integer,
  destacado integer not null default 0,
  llave_hash text
);

-- Un aviso gratis por WhatsApp, por sección, de por vida (nunca se borra,
-- aunque el aviso sí). Lo usa solo el servidor, la página no puede leerla.
create table if not exists avisos_gratis_usados (
  whatsapp text not null,
  seccion text not null,
  primera_vez integer not null,
  primary key (whatsapp, seccion)
);

create index if not exists empleos_fecha on empleos (fecha desc);
create index if not exists mercaderia_fecha on mercaderia (fecha desc);
create index if not exists servicios_fecha on servicios (fecha desc);
