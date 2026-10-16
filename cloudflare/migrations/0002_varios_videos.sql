-- Mercadería admite varios videos por aviso: nueva columna "videos" (lista JSON,
-- como "fotos"). La columna vieja "video" se queda por compatibilidad y copia el
-- primer video de la lista. Aquí se pasa el video actual de cada aviso a la lista.
alter table mercaderia add column videos text not null default '[]';
update mercaderia set videos = json_array(video) where video is not null and video != '';
