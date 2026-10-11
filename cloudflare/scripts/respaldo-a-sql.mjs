// Convierte el respaldo de Supabase (archivos .json de respaldo-supabase/) en
// un lote de instrucciones para cargarlo en la base D1 de Cloudflare.
// Uso:
//   node scripts/respaldo-a-sql.mjs ../respaldo-supabase
//   cf d1 query <id-de-la-base> --batch @../respaldo-supabase/importar-a-cloudflare.json
// Los avisos migrados no traen "llave": solo el administrador puede editarlos.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const carpeta = process.argv[2];
if (!carpeta) throw new Error("Falta la carpeta del respaldo.");

const valor = (v) => {
	if (v === null || v === undefined) return null;
	if (typeof v === "boolean") return v ? 1 : 0;
	if (typeof v === "object") return JSON.stringify(v);
	return v;
};

const lote = [];
for (const tabla of ["empleos", "mercaderia", "servicios"]) {
	const filas = JSON.parse(readFileSync(join(carpeta, `${tabla}.json`), "utf8"));
	for (const fila of filas) {
		const columnas = Object.keys(fila);
		lote.push({
			sql: `insert or ignore into ${tabla} (${columnas.join(", ")}) values (${columnas.map(() => "?").join(", ")})`,
			params: columnas.map((c) => valor(fila[c])),
		});
		// Que su WhatsApp ya cuente como "aviso gratis usado", igual que en Supabase.
		lote.push({
			sql: "insert or ignore into avisos_gratis_usados (whatsapp, seccion, primera_vez) values (?, ?, ?)",
			params: [fila.whatsapp, tabla, fila.fecha],
		});
	}
	console.log(`${tabla}: ${filas.length} avisos`);
}

const salida = join(carpeta, "importar-a-cloudflare.json");
writeFileSync(salida, JSON.stringify(lote));
console.log(`Listo: ${salida}`);
