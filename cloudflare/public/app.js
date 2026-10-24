// Directorio de costureros y talleres — avisos guardados en Cloudflare (base D1,
// compartida entre todos los que entren a la página; ver src/index.ts).
// Al publicar, el servidor le da a este celular una "llave" secreta del aviso:
// solo con esa llave se puede editar o eliminar. Las llaves se guardan en este
// navegador — si la persona borra sus datos o cambia de celular, ya no podrá
// editar su aviso (habría que pedírselo al administrador).
// Tres secciones independientes: Empleos, Mercadería (compra/venta) y Servicios.

const LLAVES_KEY = 'costureros_llaves_v1';
const ADMIN_KEY = 'costureros_admin_v1';

// Enlace del administrador: /?admin=LLAVE guarda la llave maestra en este
// navegador (y la borra de la barra de direcciones). Con ella se ven los botones
// Editar/Eliminar en todos los avisos.
try {
  const params = new URLSearchParams(location.search);
  if (params.get('admin')) {
    localStorage.setItem(ADMIN_KEY, params.get('admin'));
    params.delete('admin');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }
} catch (e) { /* ignore */ }
const adminLlave = () => { try { return localStorage.getItem(ADMIN_KEY) || ''; } catch (e) { return ''; } };
const esMio = id => !!adminLlave() || mineIds.includes(id);

// Habla con el servidor. Devuelve { ok, data } o { ok: false, message } con el
// detalle real del error (sin internet, aviso ajeno, etc.).
async function api(method, path, body, llave) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (llave) headers['x-llave'] = llave;
  try {
    const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: (data && data.error) || `Error ${res.status}` };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: 'No hay conexión con el servidor. Revisa tu internet.' };
  }
}

// Un aviso gratis dura publicado esta cantidad de días antes de ocultarse solo
// (no se borra, solo deja de aparecer en las búsquedas). Pagar por Yape extiende
// "vence" y marca "destacado" — ver confirmYapePayment() y el README.
const DIAS_GRATIS = 7;
const DIAS_EXTENSION_PAGADA = 7; // referencia para el README/SQL de "marcar destacado" — no la lee el código.

// Mientras haya pocos avisos, los que pasaron sus 7 días se quedan visibles con la
// etiqueta "Caducado" (al final de la lista). Cuando haya bastantes, poner en false
// y vuelven a esconderse. Los que nacen vencidos (2.º aviso gratis sin pagar,
// vence <= fecha) siguen ocultos siempre.
const MOSTRAR_CADUCADOS = true;
const esCaducado = l => !!(l.vence && l.vence < Date.now());
const ocultarPorVencido = l =>
  esCaducado(l) && !esMio(l.id) && !(MOSTRAR_CADUCADOS && l.vence > l.fecha);

function empleoToDb(l) {
  return {
    id: l.id, tipo: l.tipo, perfiles: l.perfiles, prendas: l.prendas, telas: l.telas,
    experiencia: l.experiencia, maquinas: l.maquinas, operaciones: l.operaciones,
    labor_manual: l.laborManual, tamano_taller: l.tamanoTaller, modalidad_pago: l.modalidadPago,
    pago: l.pago, disponibilidad: l.disponibilidad, zona: l.zona, zonas_trabajo: l.zonasTrabajo || [],
    contacto: l.contacto, whatsapp: l.whatsapp, descripcion: l.descripcion, urgente: l.urgente,
    documento: l.documento || null, documento_tipo: l.documentoTipo || null, fotos: l.fotos || [],
    videos: l.videos || [],
    fecha: l.fecha, vence: l.vence || null, destacado: !!l.destacado,
  };
}
function empleoFromDb(r) {
  return {
    id: r.id, tipo: r.tipo, perfiles: r.perfiles, prendas: r.prendas, telas: r.telas,
    experiencia: r.experiencia, maquinas: r.maquinas, operaciones: r.operaciones,
    laborManual: r.labor_manual, tamanoTaller: r.tamano_taller, modalidadPago: r.modalidad_pago,
    pago: r.pago, disponibilidad: r.disponibilidad, zona: r.zona, zonasTrabajo: r.zonas_trabajo,
    contacto: r.contacto, whatsapp: r.whatsapp, descripcion: r.descripcion, urgente: r.urgente,
    documento: r.documento, documentoTipo: r.documento_tipo, fotos: r.fotos, fecha: r.fecha,
    videos: r.videos || [],
    vence: r.vence, destacado: !!r.destacado,
  };
}
function mercToDb(l) {
  return {
    id: l.id, tipo: l.tipo, items: l.items, tallas: l.tallas, colores: l.colores,
    cantidad: l.cantidad, venta_tipo: l.ventaTipo, modalidad_venta: l.modalidadVenta,
    precio_mayor: l.precioMayor, precio_menor: l.precioMenor, zona: l.zona, contacto: l.contacto,
    whatsapp: l.whatsapp, descripcion: l.descripcion, urgente: l.urgente, fotos: l.fotos || [],
    videos: l.videos || [],
    video: (l.videos && l.videos[0]) || null,
    documento: l.documento || null, documento_tipo: l.documentoTipo || null, fecha: l.fecha,
    vence: l.vence || null, destacado: !!l.destacado,
  };
}
function mercFromDb(r) {
  return {
    id: r.id, tipo: r.tipo, items: r.items, tallas: r.tallas, colores: r.colores,
    cantidad: r.cantidad, ventaTipo: r.venta_tipo, modalidadVenta: r.modalidad_venta,
    precioMayor: r.precio_mayor, precioMenor: r.precio_menor, zona: r.zona, contacto: r.contacto,
    whatsapp: r.whatsapp, descripcion: r.descripcion, urgente: r.urgente, fotos: r.fotos,
    // Avisos viejos solo traen "video" (uno): se muestra como lista de uno.
    videos: (r.videos && r.videos.length) ? r.videos : (r.video ? [r.video] : []),
    documento: r.documento, documentoTipo: r.documento_tipo, fecha: r.fecha,
    vence: r.vence, destacado: !!r.destacado,
  };
}
function servicioToDb(l) {
  return {
    id: l.id, tipo: l.tipo, tipos_servicio: l.tiposServicio, prendas: l.prendas,
    capacidad: l.capacidad, zona: l.zona, precio: l.precio, contacto: l.contacto,
    whatsapp: l.whatsapp, descripcion: l.descripcion, urgente: l.urgente, fotos: l.fotos || [],
    videos: l.videos || [],
    documento: l.documento || null, documento_tipo: l.documentoTipo || null, fecha: l.fecha,
    vence: l.vence || null, destacado: !!l.destacado,
  };
}
function servicioFromDb(r) {
  return {
    id: r.id, tipo: r.tipo, tiposServicio: r.tipos_servicio, prendas: r.prendas,
    capacidad: r.capacidad, zona: r.zona, precio: r.precio, contacto: r.contacto,
    whatsapp: r.whatsapp, descripcion: r.descripcion, urgente: r.urgente, fotos: r.fotos,
    videos: r.videos || [],
    documento: r.documento, documentoTipo: r.documento_tipo, fecha: r.fecha,
    vence: r.vence, destacado: !!r.destacado,
  };
}

// A este correo llegan los reportes y las confirmaciones de pago. No usamos
// WhatsApp aquí a propósito: así el número personal de Sergio no queda
// expuesto en el código de la página.
const ADMIN_EMAIL = 'sergioestratega.oficial@gmail.com';
// El número de Yape sí tiene que ser visible para que la gente pueda pagar —
// eso lo exige Yape, no es una decisión de la app.
const YAPE_NUMBER = '926924581';

const PERFILES = ['Operario(a) de máquina', 'Manual de costura', 'Cortador(a)', 'Vendedor(a)'];

const PRENDAS = [
  'Polos', 'Camisetas', 'Camisas', 'Pantalones/Jeans', 'Ropa deportiva',
  'Ropa interior/Lencería', 'Uniformes', 'Chompas/Tejido', 'Casacas', 'Otra'
];

const TELAS = ['Tela punto (polos, buzos)', 'Tela plana (denim, drill, etc.)', 'Tejido grueso', 'Otra'];

const EXPERIENCIA = [
  'Sin experiencia', 'Sin experiencia, con ganas de aprender',
  'Menos de 1 año', '1 a 3 años', '3 a 5 años', '5 a 10 años', 'Más de 10 años', 'Más de 15 años'
];

const MAQUINAS = [
  'Recta', 'Remalle', 'Recubridora', 'Collaretera', 'Ojaladora',
  'Botonera', 'Cortadora de tela', 'Otra'
];

const OPERACIONES = [
  'Cerrado de costado', 'Pegado de manga', 'Bastas', 'Pretina',
  'Bolsillos', 'Cierres/cremalleras', 'Armado completo', 'Otra'
];

const LABOR_MANUAL = ['Habilitado', 'Acabados', 'Planchado/Vaporizado', 'Limpieza/Deshilachado', 'Empaquetado', 'Otra'];

const TAMANO_TALLER = ['Taller pequeño', 'Taller mediano', 'Taller grande / Fábrica'];

const MODALIDAD_PAGO = ['Jornal (sueldo semanal)', 'Destajo por prenda (armado completo)', 'Destajo por operación', 'Pago por días trabajados', 'A tratar'];

const DISPONIBILIDAD = ['Tiempo completo (L-S)', 'Medio tiempo (mañana)', 'Medio tiempo (tarde)', 'Días específicos', 'Fines de semana', 'Turno noche', 'Amanecidas', 'Otra'];

const ZONAS = [
  'Santa Anita', 'Ate - Vitarte', 'La Molina', 'San Luis',
  'El Agustino', 'San Juan de Lurigancho', 'Chosica', 'Cercado de Lima', 'Gamarra', 'Otro'
];

const MERC_ITEMS = [
  'Polos', 'Camisetas', 'Camisas', 'Pantalones/Jeans', 'Ropa deportiva',
  'Ropa interior/Lencería', 'Uniformes', 'Chompas/Tejido', 'Casacas',
  'Telas (por rollo)', 'Insumos/Accesorios de costura', 'Otra'
];

const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Talla única/estándar', 'Otra'];

const COLORES = [
  'Negro', 'Blanco', 'Gris', 'Azul', 'Celeste', 'Rojo', 'Verde',
  'Amarillo', 'Rosado', 'Beige/Crema', 'Marrón', 'Multicolor/Varios colores', 'Otro'
];

const VENTA_TIPO = ['Por mayor', 'Por menor', 'Mayor y menor'];

const MODALIDAD_VENTA = ['Contra entrega', 'Envío de muestra primero', 'Recojo en tienda/domicilio', 'Envío a nivel nacional', 'Otra'];

const MERC_ZONAS = [
  'Santa Anita', 'Ate - Vitarte', 'La Molina', 'San Luis',
  'El Agustino', 'San Juan de Lurigancho', 'Chosica', 'Cercado de Lima', 'Gamarra',
  'Provincia - Sierra', 'Provincia - Costa', 'Provincia - Selva', 'Todo el Perú (envío nacional)', 'Otro'
];

const TIPOS_SERVICIO = ['Corte', 'Confección', 'Corte y confección', 'Estampado', 'Bordado', 'Sublimado', 'Otro'];

// Los avisos viven en la base de Cloudflare (ver migrations/0001_inicial.sql).

let listings = [];
let mercListings = [];
let servicioListings = [];
let llaves = loadLlaves();
let mineIds = Object.keys(llaves);
let activeTipo = '';
let activeMercTipo = '';
let activeServicioTipo = '';
let editingId = null;
let mercEditingId = null;
let servicioEditingId = null;
let currentView = 'empleos';
const MAX_PHOTOS = 20;
let formPhotoPicker = null;
let formVideoPicker = null;
let mercPhotoPicker = null;
let servicioPhotoPicker = null;
let servicioVideoPicker = null;

// Hasta MAX_VIDEOS videos por aviso de Mercadería, subidos al servidor (R2 de Cloudflare;
// no se guarda como texto en la base como las fotos — pesa demasiado). Ver
// mercVideoPicker() y uploadMercVideo().
const MAX_VIDEO_MB = 25;
const MAX_VIDEOS = 6;
let mercVideoPicker = null;

// Si la base no responde, avisamos con un error visible en vez de mostrar la
// página vacía (antes parecía que "se habían borrado" los avisos).
async function fetchSeccion(seccion, fromDb) {
  const result = await api('GET', `/api/${seccion}`);
  if (!result.ok) throw new Error(`No se pudieron cargar los avisos (${result.message}).`);
  return result.data.map(fromDb);
}

// Crear (sin id todavía) o editar (con la llave de este celular). Al crear, el
// servidor devuelve el aviso con su id y la llave nueva, que se guarda aquí.
async function saveSeccion(seccion, editingIdActual, row, fromDb) {
  const result = editingIdActual
    ? await api('PUT', `/api/${seccion}/${encodeURIComponent(editingIdActual)}`, row, llaves[editingIdActual] || adminLlave())
    : await api('POST', `/api/${seccion}`, row);
  if (!result.ok) return { ok: false, message: result.message };
  if (result.data.llave) {
    llaves[result.data.aviso.id] = result.data.llave;
    saveLlaves();
  }
  return { ok: true, saved: fromDb(result.data.aviso) };
}

async function removeSeccion(seccion, id) {
  const result = await api('DELETE', `/api/${seccion}/${encodeURIComponent(id)}`, undefined, llaves[id] || adminLlave());
  if (result.ok) { delete llaves[id]; saveLlaves(); }
  return { ok: result.ok, message: result.ok ? null : result.message };
}

const fetchListings = () => fetchSeccion('empleos', empleoFromDb);
const fetchMercListings = () => fetchSeccion('mercaderia', mercFromDb);
const fetchServicios = () => fetchSeccion('servicios', servicioFromDb);
const saveListing = (l) => saveSeccion('empleos', editingId, empleoToDb(l), empleoFromDb);
const saveMercListing = (l) => saveSeccion('mercaderia', mercEditingId, mercToDb(l), mercFromDb);
const saveServicio = (l) => saveSeccion('servicios', servicioEditingId, servicioToDb(l), servicioFromDb);
const removeListing = (id) => removeSeccion('empleos', id);
const removeMercListing = (id) => removeSeccion('mercaderia', id);
const removeServicio = (id) => removeSeccion('servicios', id);

// Reduce el archivo a una sola imagen liviana (comprimida) para que quepa cómodamente
// en localStorage — no se guarda el archivo original ni video: ver nota del formulario.
function readAndCompressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height >= width && height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

// Controla un selector de "hasta MAX_PHOTOS fotos" para un formulario: comprime
// cada imagen al elegirla, dibuja las miniaturas, y permite quitarlas una por una.
// confirmWrapId (opcional) es una casilla "mis fotos son apropiadas" que solo se
// pide (y solo bloquea el envío) cuando hay al menos una foto agregada.
function makePhotoPicker(inputId, listId, labelId, confirmWrapId) {
  let photos = [];

  function updateConfirmCheckbox() {
    if (!confirmWrapId) return;
    const wrap = document.getElementById(confirmWrapId);
    const checkbox = wrap.querySelector('input');
    const show = photos.length > 0;
    wrap.classList.toggle('hidden', !show);
    checkbox.required = show;
    if (!show) checkbox.checked = false;
  }

  function renderThumbs() {
    const list = document.getElementById(listId);
    list.innerHTML = '';
    photos.forEach((src, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'foto-thumb';
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'foto-thumb-remove';
      removeBtn.setAttribute('aria-label', 'Quitar foto');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => { photos.splice(i, 1); renderThumbs(); });
      thumb.appendChild(img);
      thumb.appendChild(removeBtn);
      list.appendChild(thumb);
    });
    document.getElementById(labelId).classList.toggle('hidden', photos.length >= MAX_PHOTOS);
    updateConfirmCheckbox();
  }

  document.getElementById(inputId).addEventListener('change', async (e) => {
    const files = Array.from(e.target.files).slice(0, MAX_PHOTOS - photos.length);
    for (const file of files) {
      try {
        photos.push(await readAndCompressImage(file, 480, 0.55));
      } catch (err) {
        alert('No se pudo procesar una de las imágenes. Prueba con otra.');
      }
    }
    e.target.value = '';
    renderThumbs();
  });

  return {
    get: () => photos,
    set(arr) { photos = (arr || []).slice(0, MAX_PHOTOS); renderThumbs(); },
    reset() { photos = []; renderThumbs(); },
  };
}

// Controla el selector de VARIOS videos del formulario de Mercadería (hasta
// MAX_VIDEOS). A diferencia de las fotos, los videos NO se comprimen ni se
// guardan como texto en la base — se suben tal cual al servidor (R2) recién al
// enviar el formulario (ver uploadMercVideo). Aquí solo se valida el peso y se
// arma la vista previa (con una URL local mientras no se han subido).
// Cada elemento: { file, objectUrl } (nuevo) o { url } (ya subido).
function makeVideoPicker(inputId, previewId, labelId, confirmWrapId) {
  let items = [];

  function updateConfirmCheckbox() {
    if (!confirmWrapId) return;
    const wrap = document.getElementById(confirmWrapId);
    const checkbox = wrap.querySelector('input');
    const show = items.length > 0;
    wrap.classList.toggle('hidden', !show);
    checkbox.required = show;
    if (!show) checkbox.checked = false;
  }

  function dropItem(item) {
    if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    items = items.filter(x => x !== item);
  }

  function renderPreview() {
    const list = document.getElementById(previewId);
    list.innerHTML = '';
    list.classList.add('flex', 'flex-wrap', 'gap-2');
    items.forEach((item) => {
      const wrap = document.createElement('div');
      wrap.className = 'relative w-28';
      const video = document.createElement('video');
      video.src = item.objectUrl || item.url;
      video.controls = true;
      video.muted = true;
      video.preload = 'metadata';
      video.className = 'w-28 rounded-xl border border-stone-200 block';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'foto-thumb-remove';
      removeBtn.setAttribute('aria-label', 'Quitar video');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => { dropItem(item); renderPreview(); });
      wrap.appendChild(video);
      wrap.appendChild(removeBtn);
      list.appendChild(wrap);
    });
    const label = document.getElementById(labelId);
    label.classList.toggle('hidden', items.length >= MAX_VIDEOS);
    label.lastChild.textContent = items.length ? ' Agregar otro video' : ' Agregar video';
    updateConfirmCheckbox();
  }

  document.getElementById(inputId).addEventListener('change', (e) => {
    const picked = [...e.target.files];
    e.target.value = '';
    let tooBig = 0;
    let tooMany = 0;
    picked.forEach((file) => {
      if (file.size > MAX_VIDEO_MB * 1024 * 1024) { tooBig++; return; }
      if (items.length >= MAX_VIDEOS) { tooMany++; return; }
      items.push({ file, objectUrl: URL.createObjectURL(file) });
    });
    if (tooBig) alert(`${tooBig === 1 ? 'Un video pesa' : tooBig + ' videos pesan'} más de ${MAX_VIDEO_MB} MB y no se agregó. Prueba con uno más corto o de menor calidad.`);
    if (tooMany) alert(`Máximo ${MAX_VIDEOS} videos por aviso. Sobraron ${tooMany}.`);
    renderPreview();
  });

  return {
    getItems: () => items,
    isEmpty: () => items.length === 0,
    set(urls) {
      items.forEach(i => i.objectUrl && URL.revokeObjectURL(i.objectUrl));
      items = (urls || []).map(url => ({ url }));
      renderPreview();
    },
    reset() { this.set([]); },
  };
}

// Sube el video elegido al servidor y devuelve su dirección — recién al momento
// de publicar, no antes (evita subir videos que la persona luego descarta). Si
// falla, devuelve ok:false con el detalle del error real.
async function uploadMercVideo(file) {
  try {
    const res = await fetch('/api/videos', { method: 'POST', headers: { 'content-type': file.type || 'video/mp4' }, body: file });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: (data && data.error) || `Error ${res.status}` };
    return { ok: true, url: data.url };
  } catch (err) {
    return { ok: false, message: 'No hay conexión con el servidor. Revisa tu internet.' };
  }
}

function loadLlaves() {
  try { return JSON.parse(localStorage.getItem(LLAVES_KEY)) || {}; } catch (e) { return {}; }
}

function saveLlaves() {
  try { localStorage.setItem(LLAVES_KEY, JSON.stringify(llaves)); } catch (e) { /* ignore */ }
  mineIds = Object.keys(llaves);
}

function fillSelect(select, options) {
  options.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt;
    el.textContent = opt;
    select.appendChild(el);
  });
}

function timeAgo(ts) {
  const diffMin = Math.round((Date.now() - ts) / 60000);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  return `hace ${Math.round(diffH / 24)} d`;
}

// ---------- Utilidades genéricas de chips ("otra" con texto libre) ----------

function buildChipGroup(containerId, values) {
  const wrap = document.getElementById(containerId);
  values.forEach(v => {
    const label = document.createElement('label');
    label.className = 'cat-toggle';
    label.innerHTML = `<input type="checkbox" value="${v}"><span>${v}</span>`;
    wrap.appendChild(label);
  });
}

function checkedValues(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map(i => i.value);
}

function resolveChipValues(containerId, otroInputId, triggerValue = 'Otra') {
  const checked = checkedValues(containerId);
  if (!checked.includes(triggerValue)) return checked;
  const custom = document.getElementById(otroInputId).value.trim();
  if (!custom) return checked;
  const withoutOtra = checked.filter(v => v !== triggerValue);
  const customValues = custom.split(',').map(s => s.trim()).filter(Boolean);
  return [...withoutOtra, ...customValues];
}

// Como resolveChipValues, pero para un "otro" de texto libre en prosa (una
// explicación, no una lista de ítems) — no separa por comas.
function resolveOtroText(containerId, otroInputId, triggerValue = 'Otra') {
  const checked = checkedValues(containerId);
  if (!checked.includes(triggerValue)) return checked;
  const custom = document.getElementById(otroInputId).value.trim();
  if (!custom) return checked;
  return [...checked.filter(v => v !== triggerValue), custom];
}

function populateChipGroup(containerId, canonicalList, storedValues, otroInputId, otroFieldId) {
  const canonicalSet = new Set(canonicalList);
  const leftovers = storedValues.filter(v => !canonicalSet.has(v));
  const hasOtra = leftovers.length > 0;
  document.querySelectorAll(`#${containerId} input`).forEach(cb => {
    cb.checked = storedValues.includes(cb.value) || (cb.value === 'Otra' && hasOtra);
  });
  document.getElementById(otroInputId).value = leftovers.join(', ');
  document.getElementById(otroFieldId).classList.toggle('hidden', !hasOtra);
}

function wireOtroToggle(containerId, otroFieldId, triggerValue = 'Otra') {
  const otraCheckbox = document.querySelector(`#${containerId} input[value="${triggerValue}"]`);
  if (!otraCheckbox) return;
  otraCheckbox.addEventListener('change', () => {
    document.getElementById(otroFieldId).classList.toggle('hidden', !otraCheckbox.checked);
  });
}

// ---------- Modalidad de pago: multi-selección + detalle cuando incluye "A tratar" ----------

function resolveModalidadPago(containerId, detalleInputId) {
  const checked = checkedValues(containerId);
  const detalle = document.getElementById(detalleInputId).value.trim();
  return checked.map(v => (v === 'A tratar' && detalle) ? `A tratar: ${detalle}` : v);
}

function populateModalidadPago(containerId, storedValues, detalleInputId, detalleFieldId) {
  let detalle = '';
  const normalized = (storedValues || []).map(v => {
    if (v.startsWith('A tratar:')) { detalle = v.slice('A tratar:'.length).trim(); return 'A tratar'; }
    return v;
  });
  document.querySelectorAll(`#${containerId} input`).forEach(cb => {
    cb.checked = normalized.includes(cb.value);
  });
  document.getElementById(detalleInputId).value = detalle;
  document.getElementById(detalleFieldId).classList.toggle('hidden', !normalized.includes('A tratar'));
}

function hideOtroFieldsIn(rootId) {
  document.querySelectorAll(`#${rootId} .otro-field`).forEach(f => f.classList.add('hidden'));
}

// ---------- Utilidad genérica de "Zona: Otro" con texto libre ----------

function wireZonaOtro(selectId, otroFieldId) {
  document.getElementById(selectId).addEventListener('change', () => updateZonaOtroVisibility(selectId, otroFieldId));
}

function updateZonaOtroVisibility(selectId, otroFieldId) {
  document.getElementById(otroFieldId).classList.toggle('hidden', document.getElementById(selectId).value !== 'Otro');
}

function resolveZona(selectId, otroId) {
  const val = document.getElementById(selectId).value;
  if (val !== 'Otro') return val;
  return document.getElementById(otroId).value.trim() || 'Otro';
}

// Un RUC (11 dígitos) es información pública en el Perú (registro SUNAT), así
// que se puede mostrar completo. Un DNI (8 dígitos) es un dato personal — nunca
// se muestra el número, solo que la persona lo registró. Devuelve null si lo
// que escribieron no tiene ni 8 ni 11 dígitos (para pedir que lo corrijan).
function parseDocumento(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 0) return { tipo: '', valor: '' };
  if (digits.length === 8) return { tipo: 'DNI', valor: digits };
  if (digits.length === 11) return { tipo: 'RUC', valor: digits };
  return null;
}

function renderCardPhotos(node, fotos) {
  const container = node.querySelector('.card-photos');
  if (!fotos || !fotos.length) { container.remove(); return; }
  fotos.forEach((src, i) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = `Foto ${i + 1} de ${fotos.length}`;
    img.title = 'Toca para ver en grande';
    img.addEventListener('click', () => abrirVisor(fotos, i));
    container.appendChild(img);
  });
}

// Visor de fotos: al tocar una foto de un aviso se abre en grande, y se pasa
// de una a otra deslizando (celular) o con las flechas (laptop).
let visor = null;
function abrirVisor(fotos, inicio) {
  if (!visor) {
    visor = document.createElement('div');
    visor.className = 'visor';
    visor.setAttribute('role', 'dialog');
    visor.setAttribute('aria-modal', 'true');
    visor.innerHTML = `
      <div class="visor-pista"></div>
      <span class="visor-contador"></span>
      <button type="button" class="visor-btn visor-cerrar" aria-label="Cerrar">✕</button>
      <button type="button" class="visor-btn visor-ant" aria-label="Foto anterior">‹</button>
      <button type="button" class="visor-btn visor-sig" aria-label="Foto siguiente">›</button>`;
    document.body.appendChild(visor);
    const pista = visor.querySelector('.visor-pista');
    const ir = paso => pista.scrollBy({ left: paso * pista.clientWidth, behavior: 'smooth' });
    visor.querySelector('.visor-cerrar').addEventListener('click', cerrarVisor);
    visor.querySelector('.visor-ant').addEventListener('click', () => ir(-1));
    visor.querySelector('.visor-sig').addEventListener('click', () => ir(1));
    pista.addEventListener('scroll', () => {
      const actual = Math.round(pista.scrollLeft / pista.clientWidth) + 1;
      visor.querySelector('.visor-contador').textContent = `${actual} / ${pista.children.length}`;
    });
    // Tocar el fondo oscuro (fuera de la foto) también cierra.
    pista.addEventListener('click', e => { if (e.target.classList.contains('visor-foto')) cerrarVisor(); });
    document.addEventListener('keydown', e => {
      if (!visor.classList.contains('abierto')) return;
      if (e.key === 'Escape') cerrarVisor();
      if (e.key === 'ArrowRight') ir(1);
      if (e.key === 'ArrowLeft') ir(-1);
    });
  }
  const pista = visor.querySelector('.visor-pista');
  pista.innerHTML = '';
  fotos.forEach((src, i) => {
    const marco = document.createElement('div');
    marco.className = 'visor-foto';
    const img = document.createElement('img');
    img.src = src;
    img.alt = `Foto ${i + 1} de ${fotos.length}`;
    marco.appendChild(img);
    pista.appendChild(marco);
  });
  visor.querySelector('.visor-ant').hidden = visor.querySelector('.visor-sig').hidden = fotos.length < 2;
  visor.classList.add('abierto');
  document.body.style.overflow = 'hidden';
  pista.scrollLeft = inicio * pista.clientWidth;
  visor.querySelector('.visor-contador').textContent = `${inicio + 1} / ${fotos.length}`;
}
function cerrarVisor() {
  visor.classList.remove('abierto');
  document.body.style.overflow = '';
}

function renderMercVideo(node, listing) {
  const box = node.querySelector('.merc-videos');
  (listing.videos || []).forEach((src) => {
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.className = 'w-full rounded-2xl bg-stone-100';
    box.appendChild(video);
  });
}

function renderDocLine(node, listing) {
  const docEl = node.querySelector('.doc-line');
  if (listing.documentoTipo === 'RUC') {
    docEl.querySelector('span').textContent = `RUC: ${listing.documento}`;
  } else if (listing.documentoTipo === 'DNI') {
    docEl.querySelector('span').textContent = 'DNI registrado';
  } else {
    docEl.remove();
  }
}

function appendChips(container, values, className) {
  values.forEach(v => {
    const chip = document.createElement('span');
    chip.className = className;
    chip.textContent = v;
    container.appendChild(chip);
  });
}

function appendMetaLine(container, template, text) {
  if (!text) return;
  const node = template.content.cloneNode(true);
  node.querySelector('span').textContent = text;
  container.appendChild(node);
}

// ================= EMPLEOS =================

function skillTags(listing) {
  if (listing.maquinas.length || listing.operaciones.length) {
    return [...listing.maquinas, ...listing.operaciones];
  }
  if (listing.laborManual.length) return listing.laborManual;
  if (listing.perfiles.includes('Cortador(a)')) return ['Corte de tela'];
  if (listing.perfiles.includes('Vendedor(a)')) return ['Venta de ropa'];
  return listing.prendas;
}

function waMessage(listing) {
  const skill = skillTags(listing).slice(0, 3).join(', ') || 'costura';
  if (listing.tipo === 'ofrezco') {
    return `Hola, vi el aviso de "${skill}" en ${listing.zona}. Me interesa, ¿sigue disponible?`;
  }
  return `Hola ${listing.contacto}, vi tu perfil de ${skill} en ${listing.zona}. Tenemos una vacante, ¿te interesa?`;
}

function waLink(listing) {
  const digits = (listing.whatsapp || '').replace(/\D/g, '');
  return `https://wa.me/51${digits}?text=${encodeURIComponent(waMessage(listing))}`;
}

function matchesFilters(listing) {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const zona = document.getElementById('filterZona').value;
  const soloUrgente = document.getElementById('filterUrgente').checked;

  if (ocultarPorVencido(listing)) return false;
  if (activeTipo && listing.tipo !== activeTipo) return false;
  if (zona && listing.zona !== zona && !(listing.zonasTrabajo || []).includes(zona)) return false;
  if (soloUrgente && !listing.urgente) return false;
  if (q) {
    const haystack = [
      listing.contacto, listing.descripcion, listing.zona, listing.experiencia,
      listing.tamanoTaller, ...(listing.modalidadPago || []),
      ...listing.perfiles, ...listing.prendas, ...listing.telas, ...(listing.zonasTrabajo || []),
      ...listing.maquinas, ...listing.operaciones, ...listing.laborManual, ...listing.disponibilidad,
    ].join(' ').toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function render() {
  const grid = document.getElementById('grid');
  const empty = document.getElementById('emptyState');
  const tpl = document.getElementById('cardTemplate');
  const metaTpl = document.getElementById('metaLineTemplate');
  grid.innerHTML = '';

  const filtered = listings
    .filter(matchesFilters)
    .sort((a, b) => (esCaducado(a) - esCaducado(b)) || (b.destacado - a.destacado) || (b.urgente - a.urgente) || (b.fecha - a.fecha));

  document.getElementById('resultCount').textContent =
    `${filtered.length} aviso${filtered.length === 1 ? '' : 's'} encontrado${filtered.length === 1 ? '' : 's'}`;

  empty.classList.toggle('visible', filtered.length === 0);

  filtered.forEach(listing => {
    const node = tpl.content.cloneNode(true);
    const article = node.querySelector('.card');
    article.dataset.id = listing.id;
    article.classList.toggle('card-urgente', !!listing.urgente);
    article.classList.toggle('card-destacado', !!listing.destacado);
    article.classList.toggle('opacity-60', esCaducado(listing));

    node.querySelector('.owner-actions').classList.toggle('hidden', !esMio(listing.id));
    renderOwnerYape(node, listing);
    renderCardPhotos(node, listing.fotos);
    renderMercVideo(node, listing);

    const tipoBadge = node.querySelector('.tipo-badge');
    tipoBadge.textContent = listing.tipo === 'ofrezco' ? 'Busca personal' : 'Busca trabajo';
    tipoBadge.classList.add(listing.tipo === 'ofrezco' ? 'badge-ofrezco' : 'badge-busca');

    node.querySelector('.urgente-badge').classList.toggle('hidden', !listing.urgente);
    node.querySelector('.destacado-badge').classList.toggle('hidden', !listing.destacado);
    node.querySelector('.vencido-badge').classList.toggle('hidden', !esCaducado(listing));
    node.querySelector('.contacto-name').textContent = listing.contacto;
    node.querySelector('.zona-line span').textContent = listing.tipo === 'busco'
      ? `Vive en ${listing.zona} · ${timeAgo(listing.fecha)}`
      : `${listing.zona} · ${timeAgo(listing.fecha)}`;
    renderDocLine(node, listing);

    appendChips(node.querySelector('.perfil-chips'), listing.perfiles, 'chip chip-perfil');

    const prendaTela = [
      listing.prendas.length ? `Prenda: ${listing.prendas.join(', ')}` : '',
      listing.telas.length ? `Tela: ${listing.telas.join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    appendMetaLine(node.querySelector('.meta-lines'), metaTpl, prendaTela);

    appendChips(node.querySelector('.skill-chips'), [...listing.maquinas, ...listing.operaciones], 'chip');
    appendChips(node.querySelector('.skill-chips'), listing.laborManual, 'chip');

    const metaLines = node.querySelector('.meta-lines');
    appendMetaLine(metaLines, metaTpl, listing.experiencia ? `Experiencia: ${listing.experiencia}` : '');
    appendMetaLine(metaLines, metaTpl, listing.tipo === 'ofrezco' && listing.tamanoTaller ? listing.tamanoTaller : '');
    appendMetaLine(metaLines, metaTpl, listing.tipo === 'busco' && listing.zonasTrabajo && listing.zonasTrabajo.length ? `También trabajaría en: ${listing.zonasTrabajo.join(', ')}` : '');

    const pagoParts = [(listing.modalidadPago || []).join(', '), listing.pago].filter(Boolean).join(' · ');
    const pagoEl = node.querySelector('.pago-text');
    if (pagoParts) { pagoEl.textContent = pagoParts; } else { pagoEl.remove(); }

    appendChips(node.querySelector('.disponibilidad-chips'), listing.disponibilidad, 'chip chip-disponibilidad');

    const descEl = node.querySelector('.desc-text');
    if (listing.descripcion) { descEl.textContent = listing.descripcion; } else { descEl.remove(); }

    node.querySelector('.wa-link').href = waLink(listing);

    grid.appendChild(node);
  });
}

function updatePerfilSections() {
  const perfiles = checkedValues('perfilChips');
  document.getElementById('maquinaSection').classList.toggle('hidden', !perfiles.includes('Operario(a) de máquina'));
  document.getElementById('manualSection').classList.toggle('hidden', !perfiles.includes('Manual de costura'));
}

function updateTallerSection() {
  const esOfrezco = document.querySelector('input[name="tipo"]:checked').value === 'ofrezco';
  document.getElementById('tallerSection').classList.toggle('hidden', !esOfrezco);
  // Un taller tiene una sola ubicación fija; un costurero/a tiene dónde vive
  // y, aparte, las zonas donde además le gustaría trabajar (pueden ser varias).
  document.getElementById('formZonaLabel').textContent = esOfrezco ? 'Zona (dónde está el taller)' : 'Distrito donde vives';
  document.getElementById('zonaTrabajoSection').classList.toggle('hidden', esOfrezco);
}

function openModal() { document.getElementById('modal').classList.add('open'); }
function closeModal() { document.getElementById('modal').classList.remove('open'); }

function openModalForCreate() {
  editingId = null;
  const form = document.getElementById('publishForm');
  form.reset();
  hideOtroFieldsIn('publishForm');
  formPhotoPicker.reset();
  formVideoPicker.reset();
  updatePerfilSections();
  updateTallerSection();
  updateZonaOtroVisibility('formZona', 'zonaOtroField');
  document.getElementById('modalTitle').textContent = 'Publicar aviso';
  document.getElementById('submitBtn').textContent = 'Publicar aviso';
  openModal();
}

function openModalForEdit(listing) {
  editingId = listing.id;
  const form = document.getElementById('publishForm');
  form.reset();

  document.querySelector(`input[name="tipo"][value="${listing.tipo}"]`).checked = true;
  document.querySelectorAll('#perfilChips input').forEach(cb => { cb.checked = listing.perfiles.includes(cb.value); });

  populateChipGroup('prendaChips', PRENDAS, listing.prendas, 'prendaOtro', 'prendaOtroField');
  populateChipGroup('telaChips', TELAS, listing.telas, 'telaOtro', 'telaOtroField');
  document.getElementById('formExperiencia').value = listing.experiencia || '';
  populateChipGroup('maquinaChips', MAQUINAS, listing.maquinas, 'maquinaOtro', 'maquinaOtroField');
  populateChipGroup('operacionChips', OPERACIONES, listing.operaciones, 'operacionOtro', 'operacionOtroField');
  populateChipGroup('manualChips', LABOR_MANUAL, listing.laborManual, 'manualOtro', 'manualOtroField');
  document.getElementById('formTamanoTaller').value = listing.tamanoTaller || '';

  if (ZONAS.includes(listing.zona)) {
    document.getElementById('formZona').value = listing.zona;
    document.getElementById('zonaOtro').value = '';
  } else {
    document.getElementById('formZona').value = 'Otro';
    document.getElementById('zonaOtro').value = listing.zona;
  }
  populateModalidadPago('modalidadPagoChips', listing.modalidadPago, 'modalidadPagoDetalle', 'modalidadPagoDetalleField');
  document.getElementById('formPago').value = listing.pago || '';
  populateChipGroup('disponibilidadChips', DISPONIBILIDAD, listing.disponibilidad, 'disponibilidadOtro', 'disponibilidadOtroField');
  populateChipGroup('zonaTrabajoChips', ZONAS, listing.zonasTrabajo || [], 'zonaTrabajoOtro', 'zonaTrabajoOtroField');
  document.getElementById('formContacto').value = listing.contacto;
  document.getElementById('formWhatsapp').value = listing.whatsapp;
  document.getElementById('formDocumento').value = listing.documento || '';
  document.getElementById('formDescripcion').value = listing.descripcion || '';
  document.getElementById('formUrgente').checked = listing.urgente;

  formPhotoPicker.set(listing.fotos);
  formVideoPicker.set(listing.videos);

  updatePerfilSections();
  updateTallerSection();
  updateZonaOtroVisibility('formZona', 'zonaOtroField');
  document.getElementById('modalTitle').textContent = 'Editar aviso';
  document.getElementById('submitBtn').textContent = 'Guardar cambios';
  openModal();
}

function openAdminEmail(subject, body) {
  window.location.href = `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function reportListing(sectionLabel, listing) {
  const body = `Quiero reportar este aviso de ${sectionLabel}: "${listing.contacto}" (publicado ${timeAgo(listing.fecha)}).\n\nMotivo: `;
  openAdminEmail(`Reporte de aviso — ${sectionLabel}`, body);
}

function confirmYapePayment(contactoInputId, whatsappInputId) {
  const contacto = document.getElementById(contactoInputId).value.trim();
  const whatsapp = document.getElementById(whatsappInputId).value.trim();
  const msg = `Hola, ya yapeé para destacar/extender mi aviso${contacto ? ` ("${contacto}")` : ''}. Mi WhatsApp: ${whatsapp}. Te comparto el comprobante.`;
  window.open(`https://wa.me/51${YAPE_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Mismo aviso de "yapea para destacar/extender" que aparece en el formulario,
// pero para un aviso ya publicado (se muestra en la propia tarjeta del dueño,
// junto a Editar/Eliminar).
function yapeUpsellLink(listing) {
  const msg = `Hola, quiero destacar/extender mi aviso ("${listing.contacto}"). Mi WhatsApp: ${listing.whatsapp}. Te comparto el comprobante.`;
  return `https://wa.me/51${YAPE_NUMBER}?text=${encodeURIComponent(msg)}`;
}

// La base de datos (no el navegador) decide si un aviso nuevo arranca gratis o
// no: cada WhatsApp tiene un solo aviso gratis de por vida en cada sección —
// aunque lo borre y lo vuelva a crear — para que no sea gratis publicar sin
// límite. Si ya lo usó, el aviso se guarda pero llega "vencido" (oculto) hasta
// que pague. Avisamos aquí mismo, apenas se publica, para que no se quede
// esperando sin saber por qué no aparece.
function warnIfFreeQuotaUsed(seccionLabel, saved) {
  if (!saved || !saved.vence || saved.vence >= Date.now()) return;
  alert(`Tu aviso se guardó, pero ya habías usado tu publicación gratis de ${seccionLabel} antes (aunque la hayas borrado) — así que este no va a aparecer en las búsquedas hasta que confirmes tu pago de S/10. Te abrimos WhatsApp para que nos avises.`);
  window.open(yapeUpsellLink(saved), '_blank');
}

function renderOwnerYape(node, listing) {
  const ownerYape = node.querySelector('.owner-yape');
  const isMine = esMio(listing.id);
  ownerYape.classList.toggle('hidden', !isMine);
  if (isMine) ownerYape.querySelector('a').href = yapeUpsellLink(listing);
}

async function deleteListing(id) {
  if (!confirm('¿Seguro que quieres eliminar este aviso?')) return;
  const result = await removeListing(id);
  if (!result.ok) { alert('No se pudo eliminar.' + (result.message ? `\n\nDetalle: ${result.message}` : ' Revisa tu conexión e intenta de nuevo.')); return; }
  listings = listings.filter(l => l.id !== id);
  render();
}

function initEmpleosForm() {
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });

  document.querySelectorAll('#perfilChips input').forEach(i => i.addEventListener('change', updatePerfilSections));
  document.querySelectorAll('input[name="tipo"]').forEach(i => i.addEventListener('change', updateTallerSection));
  wireZonaOtro('formZona', 'zonaOtroField');

  wireOtroToggle('prendaChips', 'prendaOtroField');
  wireOtroToggle('telaChips', 'telaOtroField');
  wireOtroToggle('maquinaChips', 'maquinaOtroField');
  wireOtroToggle('operacionChips', 'operacionOtroField');
  wireOtroToggle('manualChips', 'manualOtroField');
  wireOtroToggle('zonaTrabajoChips', 'zonaTrabajoOtroField', 'Otro');

  formPhotoPicker = makePhotoPicker('formFoto', 'formFotoPreviewList', 'formFotoLabel', 'formFotoConfirmWrap');
  formVideoPicker = makeVideoPicker('formVideo', 'formVideoPreview', 'formVideoLabel', 'formVideoConfirmWrap');

  document.querySelector('#publishForm .yape-confirm-link').addEventListener('click', (e) => {
    e.preventDefault();
    confirmYapePayment('formContacto', 'formWhatsapp');
  });

  document.getElementById('grid').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('.edit-btn')) {
      const listing = listings.find(l => l.id === id);
      if (listing) openModalForEdit(listing);
    } else if (e.target.closest('.delete-btn')) {
      deleteListing(id);
    } else if (e.target.closest('.report-link')) {
      const listing = listings.find(l => l.id === id);
      if (listing) reportListing('Empleos', listing);
    }
  });

  document.getElementById('publishForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const whatsappDigits = document.getElementById('formWhatsapp').value.replace(/\D/g, '');
    if (whatsappDigits.length !== 9) { alert('Ingresa un número de WhatsApp válido de 9 dígitos.'); return; }

    const doc = parseDocumento(document.getElementById('formDocumento').value);
    if (doc === null) { alert('El DNI debe tener 8 dígitos y el RUC 11. Déjalo vacío si prefieres no ponerlo.'); return; }

    const formSubmitBtn = document.getElementById('submitBtn');
    const videoItems = formVideoPicker.getItems();
    const pendientes = videoItems.filter(it => !it.url);
    if (pendientes.length) {
      const originalBtnText = formSubmitBtn.textContent;
      formSubmitBtn.disabled = true;
      for (let n = 0; n < pendientes.length; n++) {
        formSubmitBtn.textContent = `Subiendo video ${n + 1} de ${pendientes.length}...`;
        const videoResult = await uploadMercVideo(pendientes[n].file);
        if (!videoResult.ok) {
          formSubmitBtn.disabled = false;
          formSubmitBtn.textContent = originalBtnText;
          alert(`No se pudo subir el video ${n + 1}.` + (videoResult.message ? `

Detalle: ${videoResult.message}` : ' Revisa tu conexión e intenta de nuevo.'));
          return;
        }
        pendientes[n].url = videoResult.url; // si falla uno después, estos no se vuelven a subir
      }
      formSubmitBtn.textContent = originalBtnText;
    }
    const videoUrls = videoItems.map(it => it.url);

    const tipo = document.querySelector('input[name="tipo"]:checked').value;
    const perfiles = checkedValues('perfilChips');

    const data = {
      tipo,
      perfiles,
      prendas: resolveChipValues('prendaChips', 'prendaOtro'),
      telas: resolveChipValues('telaChips', 'telaOtro'),
      experiencia: document.getElementById('formExperiencia').value,
      maquinas: perfiles.includes('Operario(a) de máquina') ? resolveChipValues('maquinaChips', 'maquinaOtro') : [],
      operaciones: perfiles.includes('Operario(a) de máquina') ? resolveChipValues('operacionChips', 'operacionOtro') : [],
      laborManual: perfiles.includes('Manual de costura') ? resolveChipValues('manualChips', 'manualOtro') : [],
      tamanoTaller: tipo === 'ofrezco' ? document.getElementById('formTamanoTaller').value : '',
      modalidadPago: resolveModalidadPago('modalidadPagoChips', 'modalidadPagoDetalle'),
      pago: document.getElementById('formPago').value.trim(),
      disponibilidad: resolveOtroText('disponibilidadChips', 'disponibilidadOtro'),
      zona: resolveZona('formZona', 'zonaOtro'),
      zonasTrabajo: tipo === 'busco' ? resolveChipValues('zonaTrabajoChips', 'zonaTrabajoOtro', 'Otro') : [],
      contacto: document.getElementById('formContacto').value.trim(),
      whatsapp: whatsappDigits,
      descripcion: document.getElementById('formDescripcion').value.trim(),
      urgente: document.getElementById('formUrgente').checked,
      documento: doc.valor,
      documentoTipo: doc.tipo,
      fotos: formPhotoPicker.get(),
      videos: videoUrls,
    };

    let newId = null;
    let listingToSave;
    if (editingId) {
      listingToSave = { ...listings.find(l => l.id === editingId), ...data, id: editingId };
    } else {
      newId = 'l-' + Date.now();
      listingToSave = { id: newId, ...data, fecha: Date.now(), vence: Date.now() + DIAS_GRATIS * 86400000, destacado: false };
    }

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    const result = await saveListing(listingToSave);
    submitBtn.disabled = false;
    if (!result.ok) {
      alert('No se pudo guardar.' + (result.message ? `\n\nDetalle: ${result.message}` : ' Revisa tu conexión a internet e intenta de nuevo.'));
      return;
    }
    if (editingId) {
      const idx = listings.findIndex(l => l.id === editingId);
      if (idx !== -1) listings[idx] = listingToSave;
    } else {
      listings.unshift(result.saved || listingToSave);
      warnIfFreeQuotaUsed('Empleos', result.saved);
    }
    closeModal();
    render();
  });
}

function initEmpleosFilters() {
  document.getElementById('searchInput').addEventListener('input', render);
  document.getElementById('filterZona').addEventListener('change', render);
  document.getElementById('filterUrgente').addEventListener('change', render);

  document.querySelectorAll('#empleosView .tipo-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTipo = btn.dataset.tipo;
      document.querySelectorAll('#empleosView .tipo-tab').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      render();
    });
  });
}

// ================= MERCADERÍA =================

function mercWaMessage(listing) {
  const item = listing.items.slice(0, 2).join(', ') || 'la mercadería';
  if (listing.tipo === 'vendo') {
    return `Hola, vi que tienes ${item} disponible en ${listing.zona}. Me interesa, ¿cuál es el precio?`;
  }
  return `Hola ${listing.contacto}, vi que buscas comprar ${item}. Tengo disponible, ¿te interesa?`;
}

function mercWaLink(listing) {
  const digits = (listing.whatsapp || '').replace(/\D/g, '');
  return `https://wa.me/51${digits}?text=${encodeURIComponent(mercWaMessage(listing))}`;
}

function matchesMercFilters(listing) {
  const q = document.getElementById('mercSearchInput').value.trim().toLowerCase();
  const zona = document.getElementById('mercFilterZona').value;
  const soloUrgente = document.getElementById('mercFilterUrgente').checked;

  if (ocultarPorVencido(listing)) return false;
  if (activeMercTipo && listing.tipo !== activeMercTipo) return false;
  if (zona && listing.zona !== zona) return false;
  if (soloUrgente && !listing.urgente) return false;
  if (q) {
    const haystack = [
      listing.contacto, listing.descripcion, listing.zona, listing.cantidad,
      listing.ventaTipo, listing.precioMayor, listing.precioMenor, ...listing.items, ...listing.tallas, ...listing.colores, ...listing.modalidadVenta,
    ].join(' ').toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function mercRender() {
  const grid = document.getElementById('mercGrid');
  const empty = document.getElementById('mercEmptyState');
  const tpl = document.getElementById('mercCardTemplate');
  const metaTpl = document.getElementById('metaLineTemplate');
  grid.innerHTML = '';

  const filtered = mercListings
    .filter(matchesMercFilters)
    .sort((a, b) => (esCaducado(a) - esCaducado(b)) || (b.destacado - a.destacado) || (b.urgente - a.urgente) || (b.fecha - a.fecha));

  document.getElementById('mercResultCount').textContent =
    `${filtered.length} publicación${filtered.length === 1 ? '' : 'es'} encontrada${filtered.length === 1 ? '' : 's'}`;

  empty.classList.toggle('visible', filtered.length === 0);

  filtered.forEach(listing => {
    const node = tpl.content.cloneNode(true);
    const article = node.querySelector('.card');
    article.dataset.id = listing.id;
    article.classList.toggle('card-urgente', !!listing.urgente);
    article.classList.toggle('card-destacado', !!listing.destacado);
    article.classList.toggle('opacity-60', esCaducado(listing));

    node.querySelector('.owner-actions').classList.toggle('hidden', !esMio(listing.id));
    renderOwnerYape(node, listing);

    renderCardPhotos(node, listing.fotos || (listing.foto ? [listing.foto] : []));
    renderMercVideo(node, listing);

    const tipoBadge = node.querySelector('.tipo-badge');
    tipoBadge.textContent = listing.tipo === 'vendo' ? 'Vendo' : 'Busco comprar';
    tipoBadge.classList.add(listing.tipo === 'vendo' ? 'badge-ofrezco' : 'badge-busca');

    node.querySelector('.urgente-badge').classList.toggle('hidden', !listing.urgente);
    node.querySelector('.destacado-badge').classList.toggle('hidden', !listing.destacado);
    node.querySelector('.vencido-badge').classList.toggle('hidden', !esCaducado(listing));
    node.querySelector('.contacto-name').textContent = listing.contacto;
    node.querySelector('.zona-line span').textContent = `${listing.zona} · ${timeAgo(listing.fecha)}`;
    renderDocLine(node, listing);

    appendChips(node.querySelector('.item-chips'), listing.items, 'chip');
    appendChips(node.querySelector('.talla-chips'), listing.tallas, 'chip');
    appendChips(node.querySelector('.color-chips'), listing.colores, 'chip');

    const metaLines = node.querySelector('.meta-lines');
    const cantidadVenta = [
      listing.cantidad ? `Cantidad: ${listing.cantidad}` : '',
      listing.ventaTipo ? `Venta: ${listing.ventaTipo}` : '',
    ].filter(Boolean).join(' · ');
    appendMetaLine(metaLines, metaTpl, cantidadVenta);
    const precioLine = [
      listing.precioMayor ? `Mayor: ${listing.precioMayor}` : '',
      listing.precioMenor ? `Menor: ${listing.precioMenor}` : '',
    ].filter(Boolean).join(' · ');
    appendMetaLine(metaLines, metaTpl, precioLine ? `Precio — ${precioLine}` : '');

    appendChips(node.querySelector('.modalidad-venta-chips'), listing.modalidadVenta, 'chip chip-disponibilidad');

    const descEl = node.querySelector('.desc-text');
    if (listing.descripcion) { descEl.textContent = listing.descripcion; } else { descEl.remove(); }

    node.querySelector('.wa-link').href = mercWaLink(listing);

    grid.appendChild(node);
  });
}

function updatePrecioFields() {
  const venta = document.getElementById('mercVentaTipo').value;
  const tipo = document.querySelector('input[name="mercTipo"]:checked').value;
  const showMayor = venta === 'Por mayor' || venta === 'Mayor y menor';
  const showMenor = venta === 'Por menor' || venta === 'Mayor y menor';
  document.getElementById('precioMayorField').classList.toggle('hidden', !showMayor);
  document.getElementById('precioMenorField').classList.toggle('hidden', !showMenor);
  document.getElementById('mercPrecioMayor').required = showMayor && tipo === 'vendo';
  document.getElementById('mercPrecioMenor').required = showMenor && tipo === 'vendo';
}

function openMercModal() { document.getElementById('mercModal').classList.add('open'); }
function closeMercModal() { document.getElementById('mercModal').classList.remove('open'); }

function openMercModalForCreate() {
  mercEditingId = null;
  const form = document.getElementById('mercForm');
  form.reset();
  hideOtroFieldsIn('mercForm');
  updateZonaOtroVisibility('mercZona', 'mercZonaOtroField');
  mercPhotoPicker.reset();
  mercVideoPicker.reset();
  updatePrecioFields();
  document.getElementById('mercModalTitle').textContent = 'Publicar mercadería';
  document.getElementById('mercSubmitBtn').textContent = 'Publicar';
  openMercModal();
}

function openMercModalForEdit(listing) {
  mercEditingId = listing.id;
  const form = document.getElementById('mercForm');
  form.reset();

  document.querySelector(`input[name="mercTipo"][value="${listing.tipo}"]`).checked = true;
  populateChipGroup('mercItemChips', MERC_ITEMS, listing.items, 'mercItemOtro', 'mercItemOtroField');
  populateChipGroup('mercTallaChips', TALLAS, listing.tallas, 'mercTallaOtro', 'mercTallaOtroField');
  populateChipGroup('mercColorChips', COLORES, listing.colores, 'mercColorOtro', 'mercColorOtroField');
  document.getElementById('mercCantidad').value = listing.cantidad || '';
  document.getElementById('mercVentaTipo').value = listing.ventaTipo || '';
  populateChipGroup('mercModalidadVentaChips', MODALIDAD_VENTA, listing.modalidadVenta, 'mercModalidadVentaOtro', 'mercModalidadVentaOtroField');
  document.getElementById('mercPrecioMayor').value = listing.precioMayor || '';
  document.getElementById('mercPrecioMenor').value = listing.precioMenor || '';
  updatePrecioFields();

  if (MERC_ZONAS.includes(listing.zona)) {
    document.getElementById('mercZona').value = listing.zona;
    document.getElementById('mercZonaOtro').value = '';
  } else {
    document.getElementById('mercZona').value = 'Otro';
    document.getElementById('mercZonaOtro').value = listing.zona;
  }
  document.getElementById('mercContacto').value = listing.contacto;
  document.getElementById('mercWhatsapp').value = listing.whatsapp;
  document.getElementById('mercDocumento').value = listing.documento || '';
  document.getElementById('mercDescripcion').value = listing.descripcion || '';
  document.getElementById('mercUrgente').checked = listing.urgente;

  mercPhotoPicker.set(listing.fotos || (listing.foto ? [listing.foto] : []));
  mercVideoPicker.set(listing.videos);

  updateZonaOtroVisibility('mercZona', 'mercZonaOtroField');
  document.getElementById('mercModalTitle').textContent = 'Editar publicación';
  document.getElementById('mercSubmitBtn').textContent = 'Guardar cambios';
  openMercModal();
}

async function deleteMercListing(id) {
  if (!confirm('¿Seguro que quieres eliminar esta publicación?')) return;
  const result = await removeMercListing(id);
  if (!result.ok) { alert('No se pudo eliminar.' + (result.message ? `\n\nDetalle: ${result.message}` : ' Revisa tu conexión e intenta de nuevo.')); return; }
  mercListings = mercListings.filter(l => l.id !== id);
  mercRender();
}

function initMercForm() {
  document.getElementById('mercCloseModal').addEventListener('click', closeMercModal);
  document.getElementById('mercModal').addEventListener('click', (e) => {
    if (e.target.id === 'mercModal') closeMercModal();
  });

  document.getElementById('mercVentaTipo').addEventListener('change', updatePrecioFields);
  document.querySelectorAll('input[name="mercTipo"]').forEach(i => i.addEventListener('change', updatePrecioFields));

  wireZonaOtro('mercZona', 'mercZonaOtroField');
  wireOtroToggle('mercItemChips', 'mercItemOtroField');
  wireOtroToggle('mercTallaChips', 'mercTallaOtroField');
  wireOtroToggle('mercColorChips', 'mercColorOtroField', 'Otro');
  wireOtroToggle('mercModalidadVentaChips', 'mercModalidadVentaOtroField');

  mercPhotoPicker = makePhotoPicker('mercFoto', 'mercFotoPreviewList', 'mercFotoLabel', 'mercFotoConfirmWrap');
  mercVideoPicker = makeVideoPicker('mercVideo', 'mercVideoPreview', 'mercVideoLabel', 'mercVideoConfirmWrap');

  document.querySelector('#mercForm .yape-confirm-link').addEventListener('click', (e) => {
    e.preventDefault();
    confirmYapePayment('mercContacto', 'mercWhatsapp');
  });

  document.getElementById('mercGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('.edit-btn')) {
      const listing = mercListings.find(l => l.id === id);
      if (listing) openMercModalForEdit(listing);
    } else if (e.target.closest('.delete-btn')) {
      deleteMercListing(id);
    } else if (e.target.closest('.report-link')) {
      const listing = mercListings.find(l => l.id === id);
      if (listing) reportListing('Mercadería', listing);
    }
  });

  document.getElementById('mercForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const whatsappDigits = document.getElementById('mercWhatsapp').value.replace(/\D/g, '');
    if (whatsappDigits.length !== 9) { alert('Ingresa un número de WhatsApp válido de 9 dígitos.'); return; }

    const doc = parseDocumento(document.getElementById('mercDocumento').value);
    if (doc === null) { alert('El DNI debe tener 8 dígitos y el RUC 11. Déjalo vacío si prefieres no ponerlo.'); return; }

    const mercSubmitBtn = document.getElementById('mercSubmitBtn');
    const videoItems = mercVideoPicker.getItems();
    const pendientes = videoItems.filter(it => !it.url);
    if (pendientes.length) {
      const originalBtnText = mercSubmitBtn.textContent;
      mercSubmitBtn.disabled = true;
      for (let n = 0; n < pendientes.length; n++) {
        mercSubmitBtn.textContent = `Subiendo video ${n + 1} de ${pendientes.length}...`;
        const videoResult = await uploadMercVideo(pendientes[n].file);
        if (!videoResult.ok) {
          mercSubmitBtn.disabled = false;
          mercSubmitBtn.textContent = originalBtnText;
          alert(`No se pudo subir el video ${n + 1}.` + (videoResult.message ? `

Detalle: ${videoResult.message}` : ' Revisa tu conexión e intenta de nuevo.'));
          return;
        }
        pendientes[n].url = videoResult.url; // si falla uno después, estos no se vuelven a subir
      }
      mercSubmitBtn.textContent = originalBtnText;
    }
    const videoUrls = videoItems.map(it => it.url);

    const data = {
      tipo: document.querySelector('input[name="mercTipo"]:checked').value,
      items: resolveChipValues('mercItemChips', 'mercItemOtro'),
      tallas: resolveChipValues('mercTallaChips', 'mercTallaOtro'),
      colores: resolveChipValues('mercColorChips', 'mercColorOtro', 'Otro'),
      cantidad: document.getElementById('mercCantidad').value.trim(),
      ventaTipo: document.getElementById('mercVentaTipo').value,
      modalidadVenta: resolveChipValues('mercModalidadVentaChips', 'mercModalidadVentaOtro'),
      precioMayor: document.getElementById('mercPrecioMayor').value.trim(),
      precioMenor: document.getElementById('mercPrecioMenor').value.trim(),
      zona: resolveZona('mercZona', 'mercZonaOtro'),
      contacto: document.getElementById('mercContacto').value.trim(),
      whatsapp: whatsappDigits,
      descripcion: document.getElementById('mercDescripcion').value.trim(),
      urgente: document.getElementById('mercUrgente').checked,
      fotos: mercPhotoPicker.get(),
      videos: videoUrls,
      documento: doc.valor,
      documentoTipo: doc.tipo,
    };

    let newId = null;
    let listingToSave;
    if (mercEditingId) {
      listingToSave = { ...mercListings.find(l => l.id === mercEditingId), ...data, id: mercEditingId };
    } else {
      newId = 'm-' + Date.now();
      listingToSave = { id: newId, ...data, fecha: Date.now(), vence: Date.now() + DIAS_GRATIS * 86400000, destacado: false };
    }

    mercSubmitBtn.disabled = true;
    const result = await saveMercListing(listingToSave);
    mercSubmitBtn.disabled = false;
    if (!result.ok) {
      alert('No se pudo guardar.' + (result.message ? `\n\nDetalle: ${result.message}` : ' Revisa tu conexión a internet e intenta de nuevo.'));
      return;
    }
    if (mercEditingId) {
      const idx = mercListings.findIndex(l => l.id === mercEditingId);
      if (idx !== -1) mercListings[idx] = listingToSave;
    } else {
      mercListings.unshift(result.saved || listingToSave);
      warnIfFreeQuotaUsed('Compra/Venta', result.saved);
    }
    closeMercModal();
    mercRender();
  });
}

function initMercFilters() {
  document.getElementById('mercSearchInput').addEventListener('input', mercRender);
  document.getElementById('mercFilterZona').addEventListener('change', mercRender);
  document.getElementById('mercFilterUrgente').addEventListener('change', mercRender);

  document.querySelectorAll('#mercaderiaView .tipo-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeMercTipo = btn.dataset.tipo;
      document.querySelectorAll('#mercaderiaView .tipo-tab').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      mercRender();
    });
  });
}

// ================= SERVICIOS =================

function servicioWaMessage(listing) {
  const tipo = listing.tiposServicio.slice(0, 2).join(', ') || 'el servicio';
  if (listing.tipo === 'ofrezco') {
    return `Hola, vi tu servicio de ${tipo} en ${listing.zona}. Me interesa, ¿cuál es tu capacidad y precio?`;
  }
  return `Hola ${listing.contacto}, vi que buscas un taller para ${tipo}. Nosotros ofrecemos ese servicio, ¿te interesa?`;
}

function servicioWaLink(listing) {
  const digits = (listing.whatsapp || '').replace(/\D/g, '');
  return `https://wa.me/51${digits}?text=${encodeURIComponent(servicioWaMessage(listing))}`;
}

function matchesServicioFilters(listing) {
  const q = document.getElementById('servicioSearchInput').value.trim().toLowerCase();
  const zona = document.getElementById('servicioFilterZona').value;
  const soloUrgente = document.getElementById('servicioFilterUrgente').checked;

  if (ocultarPorVencido(listing)) return false;
  if (activeServicioTipo && listing.tipo !== activeServicioTipo) return false;
  if (zona && listing.zona !== zona) return false;
  if (soloUrgente && !listing.urgente) return false;
  if (q) {
    const haystack = [
      listing.contacto, listing.descripcion, listing.zona, listing.capacidad, listing.precio,
      ...listing.tiposServicio, ...listing.prendas,
    ].join(' ').toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function servicioRender() {
  const grid = document.getElementById('servicioGrid');
  const empty = document.getElementById('servicioEmptyState');
  const tpl = document.getElementById('servicioCardTemplate');
  const metaTpl = document.getElementById('metaLineTemplate');
  grid.innerHTML = '';

  const filtered = servicioListings
    .filter(matchesServicioFilters)
    .sort((a, b) => (esCaducado(a) - esCaducado(b)) || (b.destacado - a.destacado) || (b.urgente - a.urgente) || (b.fecha - a.fecha));

  document.getElementById('servicioResultCount').textContent =
    `${filtered.length} publicación${filtered.length === 1 ? '' : 'es'} encontrada${filtered.length === 1 ? '' : 's'}`;

  empty.classList.toggle('visible', filtered.length === 0);

  filtered.forEach(listing => {
    const node = tpl.content.cloneNode(true);
    const article = node.querySelector('.card');
    article.dataset.id = listing.id;
    article.classList.toggle('card-urgente', !!listing.urgente);
    article.classList.toggle('card-destacado', !!listing.destacado);
    article.classList.toggle('opacity-60', esCaducado(listing));

    node.querySelector('.owner-actions').classList.toggle('hidden', !esMio(listing.id));
    renderOwnerYape(node, listing);
    renderCardPhotos(node, listing.fotos);
    renderMercVideo(node, listing);

    const tipoBadge = node.querySelector('.tipo-badge');
    tipoBadge.textContent = listing.tipo === 'ofrezco' ? 'Ofrece servicio' : 'Busca taller';
    tipoBadge.classList.add(listing.tipo === 'ofrezco' ? 'badge-ofrezco' : 'badge-busca');

    node.querySelector('.urgente-badge').classList.toggle('hidden', !listing.urgente);
    node.querySelector('.destacado-badge').classList.toggle('hidden', !listing.destacado);
    node.querySelector('.vencido-badge').classList.toggle('hidden', !esCaducado(listing));
    node.querySelector('.contacto-name').textContent = listing.contacto;
    node.querySelector('.zona-line span').textContent = `${listing.zona} · ${timeAgo(listing.fecha)}`;
    renderDocLine(node, listing);

    appendChips(node.querySelector('.tipo-servicio-chips'), listing.tiposServicio, 'chip chip-perfil');
    appendChips(node.querySelector('.prenda-chips'), listing.prendas, 'chip');

    const metaLines = node.querySelector('.meta-lines');
    appendMetaLine(metaLines, metaTpl, listing.capacidad ? `Capacidad: ${listing.capacidad}` : '');
    appendMetaLine(metaLines, metaTpl, listing.precio ? `Precio: ${listing.precio}` : '');

    const descEl = node.querySelector('.desc-text');
    if (listing.descripcion) { descEl.textContent = listing.descripcion; } else { descEl.remove(); }

    node.querySelector('.wa-link').href = servicioWaLink(listing);

    grid.appendChild(node);
  });
}

function openServicioModal() { document.getElementById('servicioModal').classList.add('open'); }
function closeServicioModal() { document.getElementById('servicioModal').classList.remove('open'); }

function openServicioModalForCreate() {
  servicioEditingId = null;
  const form = document.getElementById('servicioForm');
  form.reset();
  hideOtroFieldsIn('servicioForm');
  updateZonaOtroVisibility('servicioZona', 'servicioZonaOtroField');
  servicioPhotoPicker.reset();
  servicioVideoPicker.reset();
  document.getElementById('servicioModalTitle').textContent = 'Publicar servicio';
  document.getElementById('servicioSubmitBtn').textContent = 'Publicar servicio';
  openServicioModal();
}

function openServicioModalForEdit(listing) {
  servicioEditingId = listing.id;
  const form = document.getElementById('servicioForm');
  form.reset();

  document.querySelector(`input[name="servicioTipo"][value="${listing.tipo}"]`).checked = true;
  populateChipGroup('servicioTipoServicioChips', TIPOS_SERVICIO, listing.tiposServicio, 'servicioTipoServicioOtro', 'servicioTipoServicioOtroField');
  populateChipGroup('servicioPrendaChips', PRENDAS, listing.prendas, 'servicioPrendaOtro', 'servicioPrendaOtroField');
  document.getElementById('servicioCapacidad').value = listing.capacidad || '';
  document.getElementById('servicioPrecio').value = listing.precio || '';

  if (ZONAS.includes(listing.zona)) {
    document.getElementById('servicioZona').value = listing.zona;
    document.getElementById('servicioZonaOtro').value = '';
  } else {
    document.getElementById('servicioZona').value = 'Otro';
    document.getElementById('servicioZonaOtro').value = listing.zona;
  }
  document.getElementById('servicioContacto').value = listing.contacto;
  document.getElementById('servicioWhatsapp').value = listing.whatsapp;
  document.getElementById('servicioDocumento').value = listing.documento || '';
  document.getElementById('servicioDescripcion').value = listing.descripcion || '';
  document.getElementById('servicioUrgente').checked = listing.urgente;

  servicioPhotoPicker.set(listing.fotos);
  servicioVideoPicker.set(listing.videos);

  updateZonaOtroVisibility('servicioZona', 'servicioZonaOtroField');
  document.getElementById('servicioModalTitle').textContent = 'Editar servicio';
  document.getElementById('servicioSubmitBtn').textContent = 'Guardar cambios';
  openServicioModal();
}

async function deleteServicio(id) {
  if (!confirm('¿Seguro que quieres eliminar esta publicación?')) return;
  const result = await removeServicio(id);
  if (!result.ok) { alert('No se pudo eliminar.' + (result.message ? `\n\nDetalle: ${result.message}` : ' Revisa tu conexión e intenta de nuevo.')); return; }
  servicioListings = servicioListings.filter(l => l.id !== id);
  servicioRender();
}

function initServicioForm() {
  document.getElementById('servicioCloseModal').addEventListener('click', closeServicioModal);
  document.getElementById('servicioModal').addEventListener('click', (e) => {
    if (e.target.id === 'servicioModal') closeServicioModal();
  });

  wireZonaOtro('servicioZona', 'servicioZonaOtroField');
  wireOtroToggle('servicioTipoServicioChips', 'servicioTipoServicioOtroField', 'Otro');
  wireOtroToggle('servicioPrendaChips', 'servicioPrendaOtroField');

  servicioPhotoPicker = makePhotoPicker('servicioFoto', 'servicioFotoPreviewList', 'servicioFotoLabel', 'servicioFotoConfirmWrap');
  servicioVideoPicker = makeVideoPicker('servicioVideo', 'servicioVideoPreview', 'servicioVideoLabel', 'servicioVideoConfirmWrap');

  document.querySelector('#servicioForm .yape-confirm-link').addEventListener('click', (e) => {
    e.preventDefault();
    confirmYapePayment('servicioContacto', 'servicioWhatsapp');
  });

  document.getElementById('servicioGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('.edit-btn')) {
      const listing = servicioListings.find(l => l.id === id);
      if (listing) openServicioModalForEdit(listing);
    } else if (e.target.closest('.delete-btn')) {
      deleteServicio(id);
    } else if (e.target.closest('.report-link')) {
      const listing = servicioListings.find(l => l.id === id);
      if (listing) reportListing('Servicios', listing);
    }
  });

  document.getElementById('servicioForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const whatsappDigits = document.getElementById('servicioWhatsapp').value.replace(/\D/g, '');
    if (whatsappDigits.length !== 9) { alert('Ingresa un número de WhatsApp válido de 9 dígitos.'); return; }

    const doc = parseDocumento(document.getElementById('servicioDocumento').value);
    if (doc === null) { alert('El DNI debe tener 8 dígitos y el RUC 11. Déjalo vacío si prefieres no ponerlo.'); return; }

    const servicioSubmitBtn = document.getElementById('servicioSubmitBtn');
    const videoItems = servicioVideoPicker.getItems();
    const pendientes = videoItems.filter(it => !it.url);
    if (pendientes.length) {
      const originalBtnText = servicioSubmitBtn.textContent;
      servicioSubmitBtn.disabled = true;
      for (let n = 0; n < pendientes.length; n++) {
        servicioSubmitBtn.textContent = `Subiendo video ${n + 1} de ${pendientes.length}...`;
        const videoResult = await uploadMercVideo(pendientes[n].file);
        if (!videoResult.ok) {
          servicioSubmitBtn.disabled = false;
          servicioSubmitBtn.textContent = originalBtnText;
          alert(`No se pudo subir el video ${n + 1}.` + (videoResult.message ? `

Detalle: ${videoResult.message}` : ' Revisa tu conexión e intenta de nuevo.'));
          return;
        }
        pendientes[n].url = videoResult.url; // si falla uno después, estos no se vuelven a subir
      }
      servicioSubmitBtn.textContent = originalBtnText;
    }
    const videoUrls = videoItems.map(it => it.url);

    const data = {
      tipo: document.querySelector('input[name="servicioTipo"]:checked').value,
      tiposServicio: resolveChipValues('servicioTipoServicioChips', 'servicioTipoServicioOtro', 'Otro'),
      prendas: resolveChipValues('servicioPrendaChips', 'servicioPrendaOtro'),
      capacidad: document.getElementById('servicioCapacidad').value.trim(),
      zona: resolveZona('servicioZona', 'servicioZonaOtro'),
      precio: document.getElementById('servicioPrecio').value.trim(),
      contacto: document.getElementById('servicioContacto').value.trim(),
      whatsapp: whatsappDigits,
      descripcion: document.getElementById('servicioDescripcion').value.trim(),
      urgente: document.getElementById('servicioUrgente').checked,
      fotos: servicioPhotoPicker.get(),
      videos: videoUrls,
      documento: doc.valor,
      documentoTipo: doc.tipo,
    };

    let newId = null;
    let listingToSave;
    if (servicioEditingId) {
      listingToSave = { ...servicioListings.find(l => l.id === servicioEditingId), ...data, id: servicioEditingId };
    } else {
      newId = 's-' + Date.now();
      listingToSave = { id: newId, ...data, fecha: Date.now(), vence: Date.now() + DIAS_GRATIS * 86400000, destacado: false };
    }

    servicioSubmitBtn.disabled = true;
    const result = await saveServicio(listingToSave);
    servicioSubmitBtn.disabled = false;
    if (!result.ok) {
      alert('No se pudo guardar.' + (result.message ? `\n\nDetalle: ${result.message}` : ' Revisa tu conexión a internet e intenta de nuevo.'));
      return;
    }
    if (servicioEditingId) {
      const idx = servicioListings.findIndex(l => l.id === servicioEditingId);
      if (idx !== -1) servicioListings[idx] = listingToSave;
    } else {
      servicioListings.unshift(result.saved || listingToSave);
      warnIfFreeQuotaUsed('Servicios', result.saved);
    }
    closeServicioModal();
    servicioRender();
  });
}

function initServicioFilters() {
  document.getElementById('servicioSearchInput').addEventListener('input', servicioRender);
  document.getElementById('servicioFilterZona').addEventListener('change', servicioRender);
  document.getElementById('servicioFilterUrgente').addEventListener('change', servicioRender);

  document.querySelectorAll('#serviciosView .tipo-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeServicioTipo = btn.dataset.tipo;
      document.querySelectorAll('#serviciosView .tipo-tab').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      servicioRender();
    });
  });
}

// ================= Navegación entre secciones + compartir =================

function switchView(view) {
  currentView = view;
  document.getElementById('empleosView').classList.toggle('hidden', view !== 'empleos');
  document.getElementById('mercaderiaView').classList.toggle('hidden', view !== 'mercaderia');
  document.getElementById('serviciosView').classList.toggle('hidden', view !== 'servicios');
  document.querySelectorAll('.mode-tab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  const fabLabels = { empleos: 'Publicar aviso', mercaderia: 'Publicar mercadería', servicios: 'Publicar servicio' };
  document.getElementById('fab').setAttribute('aria-label', fabLabels[view]);
}

function initNav() {
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.getElementById('fab').addEventListener('click', () => {
    if (currentView === 'empleos') openModalForCreate();
    else if (currentView === 'mercaderia') openMercModalForCreate();
    else openServicioModalForCreate();
  });
}

function initShare() {
  const btn = document.getElementById('shareBtn');
  btn.classList.remove('hidden');
  btn.style.display = 'inline-flex';
  btn.addEventListener('click', () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: 'Confecciones Perú', url }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent('Directorio de empleos y mercadería de confección: ' + url)}`, '_blank');
    }
  });
}

async function init() {
  const [initialListings, initialMercListings, initialServicioListings] = await Promise.all([fetchListings(), fetchMercListings(), fetchServicios()]);
  listings = initialListings;
  mercListings = initialMercListings;
  servicioListings = initialServicioListings;

  fillSelect(document.getElementById('filterZona'), ZONAS);
  fillSelect(document.getElementById('formZona'), ZONAS);
  fillSelect(document.getElementById('formExperiencia'), EXPERIENCIA);
  fillSelect(document.getElementById('formTamanoTaller'), TAMANO_TALLER);

  buildChipGroup('perfilChips', PERFILES);
  buildChipGroup('prendaChips', PRENDAS);
  buildChipGroup('telaChips', TELAS);
  buildChipGroup('maquinaChips', MAQUINAS);
  buildChipGroup('operacionChips', OPERACIONES);
  buildChipGroup('manualChips', LABOR_MANUAL);
  buildChipGroup('modalidadPagoChips', MODALIDAD_PAGO);
  buildChipGroup('disponibilidadChips', DISPONIBILIDAD);
  buildChipGroup('zonaTrabajoChips', ZONAS);
  wireOtroToggle('modalidadPagoChips', 'modalidadPagoDetalleField', 'A tratar');
  wireOtroToggle('disponibilidadChips', 'disponibilidadOtroField');

  updatePerfilSections();
  updateTallerSection();
  updateZonaOtroVisibility('formZona', 'zonaOtroField');
  initEmpleosForm();
  initEmpleosFilters();
  render();

  fillSelect(document.getElementById('mercFilterZona'), MERC_ZONAS);
  fillSelect(document.getElementById('mercZona'), MERC_ZONAS);
  fillSelect(document.getElementById('mercVentaTipo'), VENTA_TIPO);
  buildChipGroup('mercItemChips', MERC_ITEMS);
  buildChipGroup('mercTallaChips', TALLAS);
  buildChipGroup('mercColorChips', COLORES);
  buildChipGroup('mercModalidadVentaChips', MODALIDAD_VENTA);
  updateZonaOtroVisibility('mercZona', 'mercZonaOtroField');
  initMercForm();
  initMercFilters();
  mercRender();

  fillSelect(document.getElementById('servicioFilterZona'), ZONAS);
  fillSelect(document.getElementById('servicioZona'), ZONAS);
  buildChipGroup('servicioTipoServicioChips', TIPOS_SERVICIO);
  buildChipGroup('servicioPrendaChips', PRENDAS);
  updateZonaOtroVisibility('servicioZona', 'servicioZonaOtroField');
  initServicioForm();
  initServicioFilters();
  servicioRender();

  initNav();
  initShare();
}

function showFatalError(err) {
  console.error(err);
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;inset:0;z-index:999;background:#2b2118;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem;font-family:sans-serif;';
  const box = document.createElement('div');
  box.innerHTML = '<p style="font-weight:700;margin-bottom:.5rem;">Hubo un problema cargando la página</p>' +
    '<p class="detalle" style="opacity:.85;margin-bottom:.6rem;"></p>' +
    '<p style="opacity:.85;margin-bottom:1.2rem;">Tus avisos no se borraron. Prueba recargar en un momento (o cerrar y volver a abrir el link).</p>' +
    '<button onclick="location.reload()" style="background:#c2542a;color:#fff;border:none;padding:.7rem 1.4rem;border-radius:.6rem;font-weight:700;cursor:pointer;">Recargar</button>';
  box.querySelector('.detalle').textContent = (err && err.message) || '';
  banner.appendChild(box);
  document.body.appendChild(banner);
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(showFatalError);
});
