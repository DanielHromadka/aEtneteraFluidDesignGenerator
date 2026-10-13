import puppeteer from "@cloudflare/puppeteer";
import type { Browser } from "@cloudflare/puppeteer";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { z } from "zod";

interface Env {
	BROWSER: Fetcher;
	SITE_URL: string;
	MCP_TOKEN: string;
}

const FONTS = [
	"Outfit", "Space Grotesk", "Inter Tight", "Manrope", "Sora", "DM Sans", "Archivo",
	"Bricolage Grotesque", "Unbounded", "Syne", "Montserrat", "Playfair Display", "JetBrains Mono",
] as const;

const hexColor = z.string().regex(/^#?[0-9a-fA-F]{6}$/, "hex colour like #cdeb12");

const inputSchema = z.object({
	text: z.string().optional().describe("Text whose SHA-256 seeds the poster. Same text = same poster."),
	file_base64: z.string().optional().describe("File content as base64; its SHA-256 seeds the poster."),
	sha256: z.string().regex(/^[0-9a-fA-F]{64}$/).optional().describe("Use this SHA-256 directly."),
	layout: z.enum(["vertical", "stacked", "minimal", "auto", "empty"]).default("vertical")
		.describe("Text template: vertical = 'etnetera' rotated 90° + & + claim, stacked = big headline + brand + logo, " +
			"minimal = & + claim only, auto = picked by hash, empty = no template texts"),
	format: z.enum(["2:3", "3:4", "4:5", "1:1", "9:16", "16:9"]).default("2:3"),
	headline: z.string().optional().describe("Headline for the stacked template; use \\n for line breaks. Default 'new\\nera'."),
	tagline: z.string().optional().describe("Claim used by the templates. Default 'Be Bold.'"),
	texts: z.array(z.object({
		text: z.string().describe("Text, \\n for line breaks"),
		x: z.number().min(-0.5).max(1.5).default(0.5).describe("Anchor x as a fraction of poster width (0 left, 1 right)"),
		y: z.number().min(-0.5).max(1.5).default(0.5).describe("Anchor y (vertical centre of the text block) as a fraction of poster height (0 top)"),
		rotation: z.number().min(-360).max(360).default(0).describe("Degrees, -90 = reads bottom-to-top"),
		size: z.number().min(0.005).max(1).default(0.08).describe("Font size as a fraction of the poster width on 2:3 (0.24 = huge, 0.03 = small print)"),
		font: z.enum(FONTS).default("Outfit"),
		weight: z.union([z.literal(300), z.literal(400), z.literal(500), z.literal(700)]).default(500),
		color: z.union([z.literal("accent"), hexColor]).default("#eef0e8").describe("Hex colour or 'accent' (follows the palette accent)"),
		align: z.enum(["left", "center", "right"]).default("center").describe("Horizontal alignment relative to x"),
		tracking: z.number().min(-0.2).max(1).default(0).describe("Letter spacing in em"),
		line_height: z.number().min(0.5).max(3).default(1),
		opacity: z.number().min(0).max(1).default(1),
		shadow: z.boolean().default(false).describe("Soft dark glow behind the text for readability"),
	})).optional().describe("Free text layers with position, rotation, size, font and colour"),
	texts_mode: z.enum(["append", "replace"]).default("append")
		.describe("append = add texts on top of the template texts, replace = only these texts"),
	colors: z.object({
		accent: hexColor.optional().describe("Main ribbon colour (default lime)"),
		secondary: hexColor.optional().describe("Glossy secondary colour (default lavender)"),
		dark: hexColor.optional().describe("Shadow / fold colour"),
	}).optional(),
	shape: z.object({
		variation: z.number().min(0).max(100).optional().describe("Nearby variants of the same hash"),
		zoom: z.number().min(0.4).max(2.6).optional(),
		turbulence: z.number().min(0.5).max(6.5).optional(),
		flow_angle_deg: z.number().min(0).max(180).optional(),
		streakiness: z.number().min(1).max(5).optional().describe("1 = swirls, 5 = long streaks"),
		detail: z.number().int().min(2).max(6).optional(),
		accent_share: z.number().min(0.1).max(0.75).optional().describe("Fraction of the area covered by the accent colour"),
		dark_share: z.number().min(0).max(0.35).optional(),
		gloss: z.number().min(0).max(1.6).optional(),
		relief: z.number().min(0).max(0.16).optional(),
		light_angle_deg: z.number().min(0).max(360).optional(),
	}).optional(),
	show_hash: z.boolean().default(false).describe("Print the SHA-256 fingerprint on the poster"),
	size: z.number().int().min(600).max(2400).default(1600).describe("Longer side in px"),
});
type Input = z.infer<typeof inputSchema>;

const SHAPE_KEYS: Record<string, (v: number) => [string, number]> = {
	variation: v => ["variation", v],
	zoom: v => ["scale", v],
	turbulence: v => ["warp", v],
	flow_angle_deg: v => ["angle", (v * Math.PI) / 180],
	streakiness: v => ["aniso", v],
	detail: v => ["oct", v],
	accent_share: v => ["limeFrac", v],
	dark_share: v => ["darkFrac", v],
	gloss: v => ["spec", v],
	relief: v => ["bump", v],
	light_angle_deg: v => ["lightDeg", v],
};

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

function base64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64.replace(/^data:[^,]*,/, "").replace(/\s/g, ""));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

async function buildUrl(env: Env, a: Input): Promise<{ url: string; seedInfo: string }> {
	const q = new URLSearchParams();
	let seedInfo: string;
	if (a.sha256) {
		q.set("sha", a.sha256.toLowerCase());
		seedInfo = "sha256 (given)";
	} else if (a.file_base64) {
		const bytes = base64ToBytes(a.file_base64);
		q.set("sha", toHex(await crypto.subtle.digest("SHA-256", bytes)));
		seedInfo = `file (${bytes.length} B)`;
	} else {
		// no input: random but reproducible short seed
		const text = a.text ?? toHex(crypto.getRandomValues(new Uint8Array(4)).buffer as ArrayBuffer);
		q.set("seed", text);
		seedInfo = `text "${text}"`;
	}
	q.set("layout", a.layout);
	q.set("format", a.format);
	if (a.headline !== undefined) q.set("headline", a.headline);
	if (a.tagline !== undefined) q.set("tagline", a.tagline);
	if (a.texts?.length) {
		const layers = a.texts.map(t => ({
			text: t.text, x: t.x, y: t.y, rot: t.rotation, size: t.size, font: t.font, weight: t.weight,
			color: t.color === "accent" ? "accent" : `#${t.color.replace("#", "")}`.toLowerCase(),
			align: t.align, tracking: t.tracking, lh: t.line_height, opacity: t.opacity, shadow: t.shadow,
		}));
		q.set(a.texts_mode === "replace" ? "layers" : "addLayers", JSON.stringify(layers));
	}
	if (a.colors?.accent) q.set("cAccent", a.colors.accent.replace("#", ""));
	if (a.colors?.secondary) q.set("cSecond", a.colors.secondary.replace("#", ""));
	if (a.colors?.dark) q.set("cDark", a.colors.dark.replace("#", ""));
	for (const [k, v] of Object.entries(a.shape ?? {})) {
		if (typeof v === "number" && SHAPE_KEYS[k]) {
			const [key, val] = SHAPE_KEYS[k](v);
			q.set(key, String(+val.toFixed(4)));
		}
	}
	if (a.show_hash) q.set("showHash", "1");
	q.set("animate", "0");
	return { url: `${env.SITE_URL}?${q}`, seedInfo };
}

// Reuse an idle browser session when possible: the free plan only allows
// launching a new browser every ~20 s.
async function getBrowser(env: Env): Promise<Browser> {
	try {
		const sessions = await puppeteer.sessions(env.BROWSER);
		const idle = sessions.find(s => !s.connectionId);
		if (idle) return await puppeteer.connect(env.BROWSER, idle.sessionId);
	} catch {
		// fall through to launch
	}
	return puppeteer.launch(env.BROWSER, { keep_alive: 120_000 });
}

async function render(env: Env, url: string, size: number) {
	const browser = await getBrowser(env);
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
		await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
		await page.waitForFunction("window.posterReady === true || !!window.posterError", { timeout: 20_000 });
		const err = await page.evaluate("window.posterError || null");
		if (err) throw new Error(`Page reported: ${err}`);
		const info = (await page.evaluate("window.posterInfo()")) as { sha256: string; share: string };
		const dataUrl = (await page.evaluate(`window.renderPoster(${size}, 'image/jpeg', 0.9)`)) as string;
		await page.close();
		return { info, base64: dataUrl.split(",")[1] };
	} finally {
		browser.disconnect();
	}
}

function createServer(env: Env) {
	const server = new McpServer({ name: "boldnewera-poster", version: "1.0.0" });

	server.registerTool(
		"generate_poster",
		{
			title: "Generate fluid poster",
			description:
				"Generates a 'liquid silk' fluid poster in the Etnetera 'new era' style (lime / lavender / dark glossy fluid, " +
				"geometric typography). The background is deterministic from the SHA-256 of the given text or file; colours, " +
				"shape, layout, font and text can be overridden. Returns the poster image and a share link to the web editor " +
				"(https://boldnewera.pages.dev) where the user can keep tweaking it.",
			inputSchema,
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async (args: Input) => {
			const { url, seedInfo } = await buildUrl(env, args);
			try {
				const { info, base64 } = await render(env, url, args.size);
				return {
					content: [
						{ type: "image", data: base64, mimeType: "image/jpeg" },
						{
							type: "text",
							text: `Poster generated from ${seedInfo}.\nSHA-256: ${info.sha256}\nEdit / download full resolution: ${info.share}`,
						},
					],
				};
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return {
					isError: true,
					content: [{
						type: "text",
						text: `Rendering failed: ${msg}\n(The free Cloudflare plan allows a new browser about every 20 s; retry shortly.)\nYou can still open the poster in the editor: ${url}`,
					}],
				};
			}
		},
	);

	return server;
}

function authorized(request: Request, env: Env, pathToken: string | undefined): boolean {
	if (!env.MCP_TOKEN) return false;
	const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
	const query = new URL(request.url).searchParams.get("token");
	return [header, query, pathToken].some(t => t === env.MCP_TOKEN);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		// accepted: /mcp (Bearer header or ?token=) and /mcp/<token> (for clients without custom headers)
		const m = url.pathname.match(/^\/mcp(?:\/([^/]+))?\/?$/);
		if (!m) {
			return new Response("boldnewera poster MCP server — endpoint: /mcp", { status: url.pathname === "/" ? 200 : 404 });
		}
		if (!authorized(request, env, m[1])) return new Response("Unauthorized", { status: 401 });

		url.pathname = "/mcp";
		url.searchParams.delete("token");
		const handler = createMcpHandler(() => createServer(env));
		return handler.fetch(new Request(url, request));
	},
} satisfies ExportedHandler<Env>;
