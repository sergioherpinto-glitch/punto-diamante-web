// Confecciones Perú — servidor en Cloudflare.
// La página (index.html + app.js) la sirve Cloudflare directo; este Worker solo
// atiende /api/... (avisos en la base D1) y /videos/... (videos en R2).
//
// Reglas que antes no existían en Supabase:
// - Editar o borrar un aviso exige la "llave" que recibió el celular que lo creó.
// - El servidor decide id, fecha, vencimiento y destacado (no la página).
import { env } from "cloudflare:workers";

type Seccion = "empleos" | "mercaderia" | "servicios";

// Columnas que la persona puede llenar desde el formulario, por sección.
const CAMPOS: Record<Seccion, { listas: string[]; textos: string[] }> = {
	empleos: {
		listas: ["perfiles", "prendas", "telas", "maquinas", "operaciones", "labor_manual", "modalidad_pago", "disponibilidad", "zonas_trabajo", "fotos"],
		textos: ["tipo", "experiencia", "tamano_taller", "pago", "zona", "contacto", "whatsapp", "descripcion", "documento", "documento_tipo"],
	},
	mercaderia: {
		listas: ["items", "tallas", "colores", "modalidad_venta", "fotos", "videos"],
		textos: ["tipo", "cantidad", "venta_tipo", "precio_mayor", "precio_menor", "zona", "contacto", "whatsapp", "descripcion", "video", "documento", "documento_tipo"],
	},
	servicios: {
		listas: ["tipos_servicio", "prendas", "fotos"],
		textos: ["tipo", "capacidad", "zona", "precio", "contacto", "whatsapp", "descripcion", "documento", "documento_tipo"],
	},
};
const PREFIJO: Record<Seccion, string> = { empleos: "l", mercaderia: "m", servicios: "s" };
// Columnas que pueden quedar vacías (null) en vez de texto vacío.
const OPCIONALES = new Set(["documento", "documento_tipo", "video"]);

const DIAS_GRATIS = 7;
const DIA_MS = 86_400_000;
const MAX_FOTOS = 20;
const MAX_VIDEOS = 6;
const MAX_AVISO_BYTES = 1_500_000; // las fotos van comprimidas dentro del aviso
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

class ErrorUsuario extends Error {
	constructor(message: string, readonly status = 400) {
		super(message);
	}
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
	});
}

async function huella(llave: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(llave));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function nuevaLlave(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Fila de la base → objeto como lo devolvía Supabase (listas y sí/no reales).
function aObjeto(seccion: Seccion, fila: Record<string, unknown>) {
	const { llave_hash: _omitir, ...resto } = fila;
	const out: Record<string, unknown> = { ...resto };
	for (const c of CAMPOS[seccion].listas) {
		try { out[c] = JSON.parse(String(fila[c] ?? "[]")); } catch { out[c] = []; }
	}
	out.urgente = !!fila.urgente;
	out.destacado = !!fila.destacado;
	return out;
}

// Toma solo los campos permitidos del cuerpo enviado y los valida.
function limpiar(seccion: Seccion, cuerpo: Record<string, unknown>) {
	const { listas, textos } = CAMPOS[seccion];
	const datos: Record<string, string | number | null> = {};
	for (const c of listas) {
		const v = cuerpo[c];
		const arr = Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
		datos[c] = JSON.stringify(c === "fotos" ? arr.slice(0, MAX_FOTOS) : arr);
	}
	if (seccion === "mercaderia") {
		// Varios videos: solo rutas /videos/... sin repetir. Una página vieja que
		// manda solo "video" (uno) sigue funcionando. "video" guarda el primero.
		const enviados: unknown[] = Array.isArray(cuerpo.videos) ? cuerpo.videos : cuerpo.video ? [cuerpo.video] : [];
		const videos = [...new Set(enviados.filter((x): x is string => typeof x === "string" && /^\/videos\/[\w.-]+$/.test(x)))].slice(0, MAX_VIDEOS);
		datos.videos = JSON.stringify(videos);
		cuerpo = { ...cuerpo, video: videos[0] ?? null };
	}
	for (const c of textos) {
		const v = cuerpo[c];
		const texto = typeof v === "string" ? v.trim() : "";
		datos[c] = OPCIONALES.has(c) && !texto ? null : texto;
	}
	datos.urgente = cuerpo.urgente ? 1 : 0;

	const whatsapp = String(datos.whatsapp).replace(/\D/g, "");
	if (whatsapp.length !== 9) throw new ErrorUsuario("El WhatsApp debe tener 9 dígitos.");
	datos.whatsapp = whatsapp;
	if (!datos.tipo || !datos.zona || !datos.contacto) throw new ErrorUsuario("Faltan datos obligatorios (tipo, zona o contacto).");
	if (datos.video && !String(datos.video).startsWith("/videos/")) datos.video = null;
	return datos;
}

async function leerCuerpo(request: Request): Promise<Record<string, unknown>> {
	const texto = await request.text();
	if (texto.length > MAX_AVISO_BYTES) throw new ErrorUsuario("El aviso pesa demasiado. Prueba con menos fotos.", 413);
	try { return JSON.parse(texto); } catch { throw new ErrorUsuario("Datos mal enviados."); }
}

async function listar(seccion: Seccion) {
	const { results } = await env.DB.prepare(`select * from ${seccion} order by fecha desc`).all();
	return results.map((f) => aObjeto(seccion, f));
}

async function buscar(seccion: Seccion, id: string) {
	return env.DB.prepare(`select * from ${seccion} where id = ?`).bind(id).first<Record<string, unknown>>();
}

async function crear(seccion: Seccion, cuerpo: Record<string, unknown>) {
	const datos = limpiar(seccion, cuerpo);
	const ahora = Date.now();
	const id = `${PREFIJO[seccion]}-${ahora}-${nuevaLlave().slice(0, 6)}`;
	const llave = nuevaLlave();

	// Un aviso gratis por WhatsApp y sección: el segundo llega vencido hasta que pague.
	const usado = await env.DB.prepare("select 1 from avisos_gratis_usados where whatsapp = ? and seccion = ?")
		.bind(datos.whatsapp, seccion).first();
	const fila = { ...datos, id, fecha: ahora, vence: usado ? ahora - 1 : ahora + DIAS_GRATIS * DIA_MS, destacado: 0, llave_hash: await huella(llave) };

	const columnas = Object.keys(fila);
	const insertar = env.DB.prepare(
		`insert into ${seccion} (${columnas.join(", ")}) values (${columnas.map(() => "?").join(", ")})`,
	).bind(...Object.values(fila));
	const marcarGratis = env.DB.prepare(
		"insert into avisos_gratis_usados (whatsapp, seccion, primera_vez) values (?, ?, ?) on conflict do nothing",
	).bind(datos.whatsapp, seccion, ahora);
	await env.DB.batch([insertar, marcarGratis]);

	return { aviso: aObjeto(seccion, fila), llave };
}

// Llave maestra de Sergio (dueño de la página): abre cualquier aviso. Aquí solo va
// su huella SHA-256, no la llave; la llave vive solo en su celular.
const HUELLA_MAESTRA = "5b21923b2036630c18a58cc7a1af3c1cf8097a12f76494ce01afc41290b6d914";

async function verificarDueno(seccion: Seccion, id: string, request: Request) {
	const fila = await buscar(seccion, id);
	if (!fila) throw new ErrorUsuario("Ese aviso ya no existe.", 404);
	const llave = request.headers.get("x-llave") || "";
	const h = llave ? await huella(llave) : "";
	if (!h || (h !== HUELLA_MAESTRA && (!fila.llave_hash || h !== fila.llave_hash))) {
		throw new ErrorUsuario("Solo se puede cambiar desde el celular que publicó el aviso.", 403);
	}
	return fila;
}

async function actualizar(seccion: Seccion, id: string, request: Request) {
	await verificarDueno(seccion, id, request);
	const datos = limpiar(seccion, await leerCuerpo(request));
	const columnas = Object.keys(datos);
	await env.DB.prepare(`update ${seccion} set ${columnas.map((c) => `${c} = ?`).join(", ")} where id = ?`)
		.bind(...Object.values(datos), id).run();
	return { aviso: aObjeto(seccion, (await buscar(seccion, id))!) };
}

async function borrar(seccion: Seccion, id: string, request: Request) {
	await verificarDueno(seccion, id, request);
	await env.DB.prepare(`delete from ${seccion} where id = ?`).bind(id).run();
	return { ok: true };
}

async function subirVideo(request: Request) {
	const tipo = request.headers.get("content-type") || "";
	if (!tipo.startsWith("video/")) throw new ErrorUsuario("Ese archivo no es un video.");
	const largo = Number(request.headers.get("content-length") || 0);
	if (!largo || largo > MAX_VIDEO_BYTES) throw new ErrorUsuario("El video pesa más de 25 MB.", 413);
	const ext = (tipo.split("/")[1] || "mp4").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "mp4";
	const clave = `${Date.now()}-${nuevaLlave().slice(0, 10)}.${ext}`;
	await env.VIDEOS.put(clave, request.body, { httpMetadata: { contentType: tipo } });
	return { url: `/videos/${clave}` };
}

// Sirve un video guardado en R2, con soporte para "adelantar" (pedidos por partes).
async function verVideo(clave: string, request: Request): Promise<Response> {
	const rango = request.headers.get("range");
	const objeto = await env.VIDEOS.get(clave, rango ? { range: request.headers } : undefined);
	if (!objeto) return new Response("Video no encontrado", { status: 404 });
	const headers = new Headers();
	objeto.writeHttpMetadata(headers);
	headers.set("etag", objeto.httpEtag);
	headers.set("accept-ranges", "bytes");
	headers.set("cache-control", "public, max-age=31536000, immutable");
	if (rango && objeto.range && "offset" in objeto.range) {
		const inicio = objeto.range.offset ?? 0;
		const largo = objeto.range.length ?? objeto.size - inicio;
		headers.set("content-range", `bytes ${inicio}-${inicio + largo - 1}/${objeto.size}`);
		headers.set("content-length", String(largo));
		return new Response(objeto.body, { status: 206, headers });
	}
	headers.set("content-length", String(objeto.size));
	return new Response(objeto.body, { headers });
}

const ES_SECCION = (s: string): s is Seccion => s in CAMPOS;

export default {
	async fetch(request) {
		const url = new URL(request.url);
		const partes = url.pathname.split("/").filter(Boolean);
		try {
			if (partes[0] === "videos" && partes[1] && request.method === "GET") {
				return await verVideo(decodeURIComponent(partes[1]), request);
			}
			if (partes[0] !== "api") return new Response("No encontrado", { status: 404 });

			if (partes[1] === "videos" && request.method === "POST") return json(await subirVideo(request));

			const seccion = partes[1] || "";
			const id = partes[2] ? decodeURIComponent(partes[2]) : "";
			if (!ES_SECCION(seccion)) return json({ error: "Sección desconocida." }, 404);

			if (!id && request.method === "GET") return json(await listar(seccion));
			if (!id && request.method === "POST") return json(await crear(seccion, await leerCuerpo(request)));
			if (id && request.method === "PUT") return json(await actualizar(seccion, id, request));
			if (id && request.method === "DELETE") return json(await borrar(seccion, id, request));
			return json({ error: "Acción no permitida." }, 405);
		} catch (err) {
			if (err instanceof ErrorUsuario) return json({ error: err.message }, err.status);
			console.error(err);
			return json({ error: "Error del servidor. Intenta de nuevo en un momento." }, 500);
		}
	},
} satisfies ExportedHandler;
