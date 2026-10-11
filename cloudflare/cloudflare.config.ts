import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

// Confecciones Perú en Cloudflare: la página + la base de avisos (D1) + los
// videos de Mercadería (R2). La página vive en index.html y public/app.js.
export default defineConfig({
	worker: {
		name: "confecciones-peru",
		compatibilityDate: "2026-10-06",
		entrypoint,
		env: {
			DB: bindings.d1({ name: "confecciones-peru-db", id: "027f4e2b-cd20-40b5-994e-a7c3c4a81d5d" }),
			VIDEOS: bindings.r2({ name: "confecciones-peru-videos" }),
		},
	},
});
