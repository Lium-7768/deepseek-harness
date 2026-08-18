import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
//#region src/device-registry.ts
/** Keeps the active mobile-device allowlist in the desktop process. */
var MobileDeviceRegistry = class {
	#devices = /* @__PURE__ */ new Map();
	/** @param snapshots - Persisted public metadata and token hashes to restore. */
	constructor(snapshots = []) {
		for (const snapshot of snapshots) {
			const hash = Buffer.from(snapshot.tokenHash, "base64");
			if (hash.byteLength === 32 && snapshot.deviceId !== "" && snapshot.label !== "") this.#devices.set(snapshot.deviceId, {
				deviceId: snapshot.deviceId,
				label: snapshot.label,
				createdAt: snapshot.createdAt,
				...snapshot.revokedAt === void 0 ? {} : { revokedAt: snapshot.revokedAt },
				tokenHash: hash
			});
		}
	}
	/** Creates a device credential after a desktop user has confirmed pairing. */
	create(label) {
		const normalizedLabel = label.trim();
		if (normalizedLabel.length === 0 || normalizedLabel.length > 120) throw new Error("A paired device label must contain between 1 and 120 characters.");
		const deviceId = randomBytes(18).toString("base64url");
		const accessToken = randomBytes(32).toString("base64url");
		this.#devices.set(deviceId, {
			deviceId,
			label: normalizedLabel,
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			tokenHash: tokenHash(accessToken)
		});
		return {
			deviceId,
			accessToken
		};
	}
	/** Lists paired devices without returning authentication material. */
	list() {
		return [...this.#devices.values()].map(publicDevice);
	}
	/** Returns a durable snapshot containing token hashes but no access tokens. */
	snapshot() {
		return [...this.#devices.values()].map((device) => ({
			...publicDevice(device),
			tokenHash: Buffer.from(device.tokenHash).toString("base64")
		}));
	}
	/** Revokes a paired device immediately. */
	revoke(deviceId) {
		const device = this.#devices.get(deviceId);
		if (device === void 0 || device.revokedAt !== void 0) return false;
		device.revokedAt = (/* @__PURE__ */ new Date()).toISOString();
		return true;
	}
	/** Verifies a device-bound bearer token without retaining its plaintext. */
	authenticate(authorization) {
		const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
		if (match === null || match === void 0) return void 0;
		const [, deviceId, accessToken] = match;
		if (deviceId === void 0 || accessToken === void 0) return void 0;
		const device = this.#devices.get(deviceId);
		if (device === void 0 || device.revokedAt !== void 0) return void 0;
		const candidate = tokenHash(accessToken);
		if (candidate.byteLength !== device.tokenHash.byteLength || !timingSafeEqual(candidate, device.tokenHash)) return void 0;
		return publicDevice(device);
	}
};
function tokenHash(value) {
	return createHash("sha256").update(value).digest();
}
function publicDevice(device) {
	return {
		deviceId: device.deviceId,
		label: device.label,
		createdAt: device.createdAt,
		...device.revokedAt === void 0 ? {} : { revokedAt: device.revokedAt }
	};
}
//#endregion
//#region src/dsh-loopback-client.ts
/** Calls the existing DSH API only through its loopback listener. */
var DshLoopbackClient = class {
	#baseUrl;
	/** @param baseUrl - The loopback URL owned by the desktop DSH runtime. */
	constructor(baseUrl) {
		const parsed = new URL(baseUrl);
		if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") throw new Error("The Mobile Gateway only accepts a loopback DSH URL.");
		this.#baseUrl = parsed;
	}
	/** Invokes one allowlisted DSH RPC and returns its business value. */
	async call(method, payload) {
		const rpcId = randomUUID();
		const response = await fetch(new URL(`/api/${method}`, this.#baseUrl), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				host: this.#baseUrl.host
			},
			body: JSON.stringify({
				type: "client-request",
				rpcId,
				method,
				payload
			})
		});
		if (!response.ok) throw new DshLoopbackError("upstream-unavailable", `DSH returned HTTP ${response.status}.`);
		const message = await response.json();
		if (message.type !== "server-response" || message.rpcId !== rpcId) throw new DshLoopbackError("upstream-unavailable", "DSH returned an invalid RPC response.");
		if (!message.result.ok) throw new DshLoopbackError("upstream-rejected", message.result.error.message, message.result.error.code, message.result.error.details);
		return message.result.value;
	}
	/** Sends a correlated response to a pending DSH interaction. */
	async respond(message) {
		const response = await fetch(new URL("/api/respond", this.#baseUrl), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				host: this.#baseUrl.host
			},
			body: JSON.stringify({
				type: "client-response",
				...message
			})
		});
		if (!response.ok) throw new DshLoopbackError("upstream-unavailable", `DSH returned HTTP ${response.status}.`);
		const receipt = await response.json();
		if (receipt.accepted !== true) throw new DshLoopbackError("upstream-rejected", receipt.reason ?? "DSH rejected the interaction response.");
		return receipt;
	}
	/** Streams validated DSH mux server requests over the host's SSE downlink. */
	async *mux(signal) {
		if (signal.aborted) throw new DOMException("Aborted", "AbortError");
		const response = await fetch(new URL("/api/events.mux", this.#baseUrl), {
			method: "GET",
			headers: {
				accept: "text/event-stream",
				host: this.#baseUrl.host
			},
			signal
		});
		if (!response.ok || response.body === null) throw new DshLoopbackError("upstream-unavailable", `DSH SSE mux connection failed (HTTP ${response.status}).`);
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) return;
				buffer += decoder.decode(value, { stream: true });
				let boundary;
				while ((boundary = buffer.indexOf("\n\n")) !== -1) {
					const chunk = buffer.slice(0, boundary);
					buffer = buffer.slice(boundary + 2);
					const data = chunk.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("");
					if (data === "") continue;
					const envelope = parseMuxEnvelope(data);
					if (envelope !== void 0) yield envelope;
				}
			}
		} finally {
			await reader.cancel().catch(() => void 0);
		}
	}
};
function parseMuxEnvelope(data) {
	try {
		const value = JSON.parse(data);
		if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
		const record = value;
		if (record.type !== "server-request" || typeof record.rpcId !== "string") return void 0;
		if (record.payload === null || typeof record.payload !== "object" || Array.isArray(record.payload)) return void 0;
		return {
			rpcId: record.rpcId,
			payload: record.payload
		};
	} catch {
		return;
	}
}
/** An upstream DSH fault translated to a Mobile Gateway-safe error. */
var DshLoopbackError = class extends Error {
	code;
	upstreamCode;
	details;
	/**
	* @param code - Mobile transport category.
	* @param message - Upstream message retained for diagnostics.
	* @param upstreamCode - DSH business error code, when the RPC was rejected.
	* @param details - DSH business error details, when the RPC was rejected.
	*/
	constructor(code, message, upstreamCode, details) {
		super(message);
		this.code = code;
		this.upstreamCode = upstreamCode;
		this.details = details;
	}
};
//#endregion
//#region src/mobile-gateway.ts
const LOOPBACK_HOST = "127.0.0.1";
const MAX_BODY_BYTES = 256 * 1024;
const MOBILE_WRITABLE_SETTINGS = new Set([
	"ui-theme",
	"locale",
	"ui-conversation",
	"agent-presets",
	"permission"
]);
/** Provides a narrow HTTP API for paired native clients over one local DSH runtime. */
var MobileGateway = class {
	#dsh;
	#devices;
	#host;
	#port;
	#server;
	#status;
	#muxAbort;
	#pending = /* @__PURE__ */ new Map();
	/** @param options - Loopback DSH and local listener configuration. */
	constructor(options) {
		this.#devices = options.devices ?? new MobileDeviceRegistry();
		this.#dsh = new DshLoopbackClient(options.dshUrl);
		this.#host = options.host ?? LOOPBACK_HOST;
		this.#port = options.port ?? 0;
		if (this.#host !== LOOPBACK_HOST && this.#host !== "localhost") throw new Error("The Mobile Gateway only permits a loopback listener.");
	}
	/** Starts the loopback HTTP listener once. */
	async start() {
		if (this.#status !== void 0) return this.#status;
		const server = createServer((request, response) => {
			this.#handle(request, response).catch((error) => {
				writeError(response, toGatewayError(error));
			});
		});
		await new Promise((resolve, reject) => {
			server.once("error", reject);
			server.listen(this.#port, this.#host, () => resolve());
		});
		const address = server.address();
		if (address === null || typeof address === "string") {
			await new Promise((resolve, reject) => server.close((error) => error === void 0 ? resolve() : reject(error)));
			throw new Error("The Mobile Gateway did not receive a TCP listener address.");
		}
		this.#server = server;
		const status = { url: `http://${this.#host}:${address.port}` };
		this.#status = status;
		this.#startMux();
		return status;
	}
	/** Stops the listener and waits until no request handler remains active. */
	async stop() {
		const server = this.#server;
		this.#server = void 0;
		this.#status = void 0;
		this.#muxAbort?.abort();
		this.#muxAbort = void 0;
		this.#pending.clear();
		if (server === void 0) return;
		await new Promise((resolve, reject) => server.close((error) => error === void 0 ? resolve() : reject(error)));
	}
	/** Creates a credential after a desktop pairing flow confirms the device label. */
	pairDevice(label) {
		return this.#devices.create(label);
	}
	/** Lists paired devices for the desktop settings surface. */
	pairedDevices() {
		return this.#devices.list();
	}
	/** Revokes a paired device immediately. */
	revokeDevice(deviceId) {
		return this.#devices.revoke(deviceId);
	}
	async #handle(request, response) {
		if (request.method === "GET" && request.url === "/v1/health") {
			writeJson(response, 200, {
				contractVersion: 1,
				status: "ok"
			});
			return;
		}
		if (this.#devices.authenticate(request.headers.authorization) === void 0) {
			writeError(response, {
				code: "unauthorized",
				message: "需要已配对的移动设备凭据。"
			});
			return;
		}
		if (request.method !== "POST" || request.headers["content-type"] !== "application/json") {
			writeError(response, {
				code: "bad-request",
				message: "移动端 API 请求必须使用 JSON POST。"
			});
			return;
		}
		const url = new URL(request.url ?? "/", "http://mobile-gateway.local");
		const body = await readJson(request);
		const pending = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/interactions$/);
		if (pending !== null) {
			this.#startMux();
			const sessionId = decodePathSegment(pending);
			const items = [...this.#pending.values()].filter((item) => item.sessionId === sessionId);
			writeJson(response, 200, await this.#response({ items }));
			return;
		}
		if (url.pathname === "/v1/sessions/list") {
			const summary = await this.#dsh.call("session.list", {});
			const items = await Promise.all((summary.items ?? []).map((item) => withVisibleTitle(this.#dsh, item)));
			writeJson(response, 200, await this.#response({
				...summary,
				items
			}));
			return;
		}
		if (url.pathname === "/v1/settings/describe") {
			writeJson(response, 200, await this.#response(await this.#dsh.call("settings.describe", {})));
			return;
		}
		if (url.pathname === "/v1/settings/update") {
			const ns = requireText(body.ns, "设置命名空间不能为空。");
			if (!MOBILE_WRITABLE_SETTINGS.has(ns)) throw new GatewayHttpError("bad-request", "此设置只能在桌面端修改。");
			const patch = requireObject(body.patch, "设置修改必须是 JSON 对象。");
			const expectedRevision = optionalRevision(body.expectedRevision);
			writeJson(response, 200, await this.#response(await this.#dsh.call("settings.update", {
				ns,
				patch,
				...expectedRevision === void 0 ? {} : { expectedRevision }
			})));
			return;
		}
		if (url.pathname === "/v1/settings/mutate") {
			const ns = requireText(body.ns, "设置命名空间不能为空。");
			if (!MOBILE_WRITABLE_SETTINGS.has(ns)) throw new GatewayHttpError("bad-request", "此设置只能在桌面端修改。");
			const ops = requireArray(body.ops, "设置修改操作必须是数组。");
			const expectedRevision = optionalRevision(body.expectedRevision);
			writeJson(response, 200, await this.#dsh.call("settings.mutate", {
				ns,
				ops,
				...expectedRevision === void 0 ? {} : { expectedRevision }
			}));
			return;
		}
		if (url.pathname === "/v1/llm/providers") {
			writeJson(response, 200, await this.#response(await this.#dsh.call("llm.providers", {})));
			return;
		}
		if (url.pathname === "/v1/llm/models") {
			writeJson(response, 200, await this.#response(await this.#dsh.call("llm.models", {})));
			return;
		}
		if (url.pathname === "/v1/agent-presets/list") {
			writeJson(response, 200, await this.#response(await this.#dsh.call("agentPreset.list", {})));
			return;
		}
		if (url.pathname === "/v1/agent-presets/read") {
			const agentPreset = requireText(body.agentPreset, "Agent 预设不能为空。");
			writeJson(response, 200, await this.#response(await this.#dsh.call("agentPreset.read", { agentPreset })));
			return;
		}
		const history = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/history$/);
		if (history !== null) {
			const value = await this.#dsh.call("session.history", { sessionId: decodePathSegment(history) });
			writeJson(response, 200, await this.#response({
				...value,
				items: toMobileHistoryItems(value)
			}));
			return;
		}
		const events = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/events$/);
		if (events !== null) {
			const since = typeof body.since === "number" && Number.isInteger(body.since) && body.since >= 0 ? body.since : 0;
			const sessionId = decodePathSegment(events);
			const items = toMobileHistoryItems(await this.#dsh.call("session.history", { sessionId })).filter((item) => typeof item.seq !== "number" || item.seq > since);
			const status = [...this.#pending.values()].some((item) => item.sessionId === sessionId) ? "waiting" : inferSessionStatus(items);
			writeJson(response, 200, await this.#response({
				since,
				items,
				status
			}));
			return;
		}
		const models = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/models$/);
		if (models !== null) {
			writeJson(response, 200, await this.#response(await this.#dsh.call("session.models", { sessionId: decodePathSegment(models) })));
			return;
		}
		const selectModel = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/model$/);
		if (selectModel !== null) {
			const provider = requireText(body.provider, "模型提供方不能为空。");
			const model = requireText(body.model, "模型不能为空。");
			const reasoningEffort = optionalText(body.reasoningEffort);
			writeJson(response, 200, await this.#response(await this.#dsh.call("session.selectModel", {
				sessionId: decodePathSegment(selectModel),
				provider,
				model,
				...reasoningEffort === void 0 ? {} : { reasoningEffort }
			})));
			return;
		}
		const selectPreset = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/agent-preset$/);
		if (selectPreset !== null) {
			const agentPreset = requireText(body.agentPreset, "Agent 预设不能为空。");
			writeJson(response, 200, await this.#response(await this.#dsh.call("agentPreset.select", {
				sessionId: decodePathSegment(selectPreset),
				agentPreset
			})));
			return;
		}
		const prompt = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/messages$/);
		if (prompt !== null) {
			const text = typeof body.text === "string" ? body.text.trim() : "";
			if (text.length === 0 || text.length > 1e5) throw new GatewayHttpError("bad-request", "消息长度必须在 1 到 100000 个字符之间。");
			writeJson(response, 200, await this.#response(await this.#dsh.call("session.prompt", {
				sessionId: decodePathSegment(prompt),
				mode: "queue",
				content: [{
					type: "text",
					text
				}]
			})));
			return;
		}
		const cancellation = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/cancel$/);
		if (cancellation !== null) {
			writeJson(response, 200, await this.#response(await this.#dsh.call("session.cancel", { sessionId: decodePathSegment(cancellation) })));
			return;
		}
		if (url.pathname === "/v1/interactions/respond") {
			const rpcId = typeof body.rpcId === "string" ? body.rpcId : "";
			const interaction = this.#pending.get(rpcId);
			if (interaction === void 0 || !isExpectedInteractionResponse(interaction, body.result)) throw new GatewayHttpError("bad-request", "响应与当前的权限或问题请求不匹配。");
			const receipt = await this.#dsh.respond({
				rpcId,
				result: body.result
			});
			this.#pending.delete(rpcId);
			writeJson(response, 200, await this.#response(receipt));
			return;
		}
		writeError(response, {
			code: "not-found",
			message: "未找到请求的移动端操作。"
		});
	}
	#startMux() {
		if (this.#muxAbort !== void 0 || this.#status === void 0) return;
		const controller = new AbortController();
		this.#muxAbort = controller;
		this.#captureMux(controller);
	}
	async #captureMux(controller) {
		try {
			for await (const envelope of this.#dsh.mux(controller.signal)) this.#rememberInteraction(envelope);
		} catch (error) {
			if (!controller.signal.aborted) console.error("[mobile-gateway] DSH mux subscription ended:", error);
		} finally {
			if (this.#muxAbort === controller) this.#muxAbort = void 0;
		}
	}
	#rememberInteraction(envelope) {
		const { payload } = envelope;
		const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : void 0;
		if (payload.type === "approval/requested" && sessionId !== void 0 && typeof payload.approvalId === "string") this.#pending.set(envelope.rpcId, {
			rpcId: envelope.rpcId,
			type: "approval/requested",
			sessionId,
			payload,
			receivedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		else if (payload.type === "question/requested" && sessionId !== void 0 && Array.isArray(payload.questions)) this.#pending.set(envelope.rpcId, {
			rpcId: envelope.rpcId,
			type: "question/requested",
			sessionId,
			payload,
			receivedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		else if (payload.type === "approval/resolved" && typeof payload.approvalId === "string") {
			for (const [rpcId, item] of this.#pending) if (item.payload.approvalId === payload.approvalId) this.#pending.delete(rpcId);
		} else if (payload.type === "question/resolved" && typeof payload.questionRpcId === "string") this.#pending.delete(payload.questionRpcId);
	}
	async #response(data) {
		return {
			contractVersion: 1,
			dshUrl: this.#status?.url ?? "",
			data
		};
	}
};
var GatewayHttpError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
	}
};
async function readJson(request) {
	const chunks = [];
	let total = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		total += buffer.byteLength;
		if (total > MAX_BODY_BYTES) throw new GatewayHttpError("bad-request", "请求体过大。");
		chunks.push(buffer);
	}
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("not an object");
		return parsed;
	} catch {
		throw new GatewayHttpError("bad-request", "请求体必须是 JSON 对象。");
	}
}
function writeJson(response, status, body) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(body));
}
function writeError(response, error) {
	writeJson(response, error.code === "unauthorized" ? 401 : error.code === "not-found" || error.code === "session-not-found" ? 404 : error.code === "settings-conflict" ? 409 : error.code === "bad-request" || error.code === "forbidden" || error.code === "agent-preset-locked" ? 400 : 502, { error });
}
function requireText(value, message) {
	if (typeof value !== "string" || value.trim() === "") throw new GatewayHttpError("bad-request", message);
	return value.trim();
}
function optionalText(value) {
	if (value === void 0) return void 0;
	return requireText(value, "设置字段必须是非空字符串。");
}
function requireObject(value, message) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new GatewayHttpError("bad-request", message);
	return value;
}
function requireArray(value, message) {
	if (!Array.isArray(value)) throw new GatewayHttpError("bad-request", message);
	return value;
}
function optionalRevision(value) {
	if (value === void 0) return void 0;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new GatewayHttpError("bad-request", "设置版本号必须是非负整数。");
	return value;
}
function toMobileHistoryItems(history) {
	return (history.events ?? []).flatMap((entry) => {
		const event = entry.event;
		if (event === void 0) return [];
		const seq = typeof event.seq === "number" && Number.isInteger(event.seq) ? event.seq : void 0;
		return [{
			...seq === void 0 ? {} : { seq },
			event
		}];
	});
}
function decodePathSegment(match) {
	const segment = match[1];
	if (segment === void 0) throw new GatewayHttpError("bad-request", "会话路径无效。");
	return decodeURIComponent(segment);
}
function isExpectedInteractionResponse(interaction, result) {
	if (result === null || typeof result !== "object" || Array.isArray(result)) return false;
	const response = result;
	if (response.ok !== true || response.value === null || typeof response.value !== "object" || Array.isArray(response.value)) return false;
	const value = response.value;
	if (interaction.type === "approval/requested") return value.sessionId === interaction.sessionId && value.approvalId === interaction.payload.approvalId && (value.outcome === "allowed-once" || value.outcome === "rejected");
	if (value.sessionId !== interaction.sessionId || value.answer === null || typeof value.answer !== "object" || Array.isArray(value.answer)) return false;
	const answers = value.answer.answers;
	if (!Array.isArray(answers) || answers.length !== interaction.payload.questions.length) return false;
	const expectedIds = new Set(interaction.payload.questions.map((question) => question.id).filter((id) => typeof id === "string"));
	return expectedIds.size === answers.length && answers.every((answer) => {
		if (answer === null || typeof answer !== "object" || Array.isArray(answer)) return false;
		const item = answer;
		return typeof item.id === "string" && expectedIds.delete(item.id) && Array.isArray(item.selected) && item.selected.every((selected) => typeof selected === "string") && (item.custom === void 0 || typeof item.custom === "string");
	});
}
function inferSessionStatus(items) {
	const last = items.at(-1)?.event;
	if (last?.type === "approval/requested" || last?.type === "question/requested") return "waiting";
	if (last?.type === "host/session-status" && last.running === true) return "running";
	return "idle";
}
function toGatewayError(error) {
	if (error instanceof GatewayHttpError) return {
		code: error.code,
		message: error.message
	};
	if (error instanceof DshLoopbackError) {
		if (error.code === "upstream-rejected") return upstreamRejectedError(error.upstreamCode);
		return {
			code: error.code,
			message: upstreamMessage(error.code)
		};
	}
	return {
		code: "upstream-unavailable",
		message: upstreamMessage("upstream-unavailable")
	};
}
function upstreamRejectedError(code) {
	switch (code) {
		case "session-not-found": return {
			code,
			message: "未找到请求的会话。"
		};
		case "model-unavailable": return {
			code,
			message: "所选模型当前不可用，请重新选择。"
		};
		case "agent-preset-locked": return {
			code,
			message: "会话已经开始，无法切换 Agent 模式。"
		};
		case "agent-preset-not-found": return {
			code,
			message: "未找到所选 Agent 预设。"
		};
		case "agent-preset-invalid": return {
			code,
			message: "所选 Agent 预设当前不可用。"
		};
		case "settings-rejected": return {
			code,
			message: "设置未被桌面端接受，请检查输入。"
		};
		case "settings-conflict": return {
			code,
			message: "设置已被其他窗口修改，请重新加载后再试。"
		};
		default: return {
			code: "upstream-rejected",
			message: upstreamMessage("upstream-rejected")
		};
	}
}
function upstreamMessage(code) {
	return code === "upstream-rejected" ? "桌面端拒绝了此次请求。" : "桌面端 DeepSeek Harness 当前不可用。";
}
function isFallbackSessionTitle(title) {
	if (typeof title !== "string") return true;
	const normalized = title.trim().toLowerCase();
	return normalized === "" || normalized === "新会话" || normalized === "new session" || normalized === "untitled session";
}
async function withVisibleTitle(client, item) {
	if (!isFallbackSessionTitle(item.title)) return item;
	try {
		const title = firstVisibleUserText(await client.call("session.history", { sessionId: item.sessionId }));
		return title === void 0 ? item : {
			...item,
			title
		};
	} catch {
		return item;
	}
}
function firstVisibleUserText(history) {
	for (const entry of history.events ?? []) {
		const event = entry.event;
		if (event === void 0 || !isUserMessageEvent(event)) continue;
		const text = eventDisplayText(event);
		if (text !== void 0 && !isInternalMobileText(text)) return text.slice(0, 80);
	}
}
function isUserMessageEvent(event) {
	const payload = event.data !== null && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : event;
	const role = [
		payload.role,
		payload.kind,
		payload.author
	].find((value) => typeof value === "string");
	if (typeof role === "string" && ["user", "human"].includes(role.toLowerCase())) return true;
	const type = typeof event.type === "string" ? event.type.toLowerCase() : "";
	return type === "user/message" || type.startsWith("user/");
}
function eventDisplayText(event) {
	const payload = event.data !== null && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : event;
	const direct = textFromContent(payload.content) ?? textFromContent(payload.text);
	if (direct !== void 0) return direct;
	const message = payload.message;
	if (message !== null && typeof message === "object" && !Array.isArray(message)) return textFromContent(message.content);
}
function textFromContent(value) {
	if (typeof value === "string" && value.trim()) return value.trim();
	if (!Array.isArray(value)) return void 0;
	const parts = value.flatMap((item) => {
		if (item === null || typeof item !== "object" || Array.isArray(item)) return [];
		const text = item.text;
		return typeof text === "string" && text.trim() ? [text.trim()] : [];
	});
	return parts.length ? parts.join("\n") : void 0;
}
function isInternalMobileText(text) {
	const lower = text.toLowerCase();
	return [
		"<system-reminder",
		"agents.md",
		"instructions from:",
		"pre-release stance",
		"reply exactly mobilegatewayok"
	].some((marker) => lower.includes(marker));
}
//#endregion
export { DshLoopbackClient, DshLoopbackError, MobileDeviceRegistry, MobileGateway };

//# sourceMappingURL=index.mjs.map