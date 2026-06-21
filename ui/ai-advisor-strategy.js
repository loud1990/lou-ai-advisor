/**
 * AI Advisor — per-game Strategy (client cache + brain bridge).
 *
 * The leader chats with the council (Chat tab) about which Victory to pursue and
 * how to get there. That conversation produces a durable STRATEGY for the current
 * game — victory goal, tech path, civic path, city build order, an empire focus
 * mix, and a threat posture — which the rest of the mod reads so the advice the
 * advisors give actually shifts with the conversation.
 *
 * Two halves:
 *   - a local Python brain (advisors/server.py) does the LLM + KB work and owns
 *     the human-readable STRATEGY.md; the panel reaches it with `fetch` over
 *     127.0.0.1 (the Civ 7 runtime allows this — see the sibling sidecar mod).
 *   - this module is the client cache + source of truth IN the game: it mirrors
 *     the latest strategy (and the chat log) to globalThis + localStorage, keyed
 *     by the map seed, so advice keeps reflecting the plan across panel re-opens
 *     and save/reloads even when the brain server is not running.
 *
 * Everything degrades gracefully: no localStorage → globalThis still works; brain
 * unreachable → a null result the caller turns into an "offline" notice.
 */

function safe(fn, dflt) { try { const v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } }

// --- brain endpoint ---------------------------------------------------------
// Must match advisors/server.py (AI_ADVISOR_PORT default 8421).
const SERVER_URL = "http://127.0.0.1:8421";
// Generous: the brain may run a local reasoning model that thinks before it answers.
const CHAT_TIMEOUT_MS = 90000;

// --- persistence ------------------------------------------------------------
const LS_KEY = "lou-ai-advisor.strategy";

const MEM = (globalThis.__aiAdvisorStrategy ||= { byGame: {} });
if (!MEM._hydrated) {
	MEM._hydrated = true;
	try {
		if (typeof localStorage !== "undefined" && localStorage) {
			const raw = localStorage.getItem(LS_KEY);
			if (raw) Object.assign(MEM.byGame, JSON.parse(raw));
		}
	} catch (e) { /* localStorage unavailable in this UI scope — globalThis still works */ }
}

function persist() {
	try {
		if (typeof localStorage !== "undefined" && localStorage) {
			localStorage.setItem(LS_KEY, JSON.stringify(MEM.byGame));
		}
	} catch (e) { /* best effort */ }
}

/** Unique id for the current game (the map seed is per-game and reload-stable). */
function gameId() {
	return safe(() => String(Configuration.getMap().mapSeed), "g");
}

function _slot() {
	const k = gameId();
	return (MEM.byGame[k] ||= { strategy: null, chat: [] });
}

/** The cached strategy object for this game, or null if none chosen yet. */
function getStrategy() { return _slot().strategy; }

/** Replace the cached strategy for this game (called with the brain's response). */
function setStrategy(strategy) {
	if (!strategy) return null;
	_slot().strategy = strategy;
	persist();
	return strategy;
}

/** True once a victory goal has been committed for this game. */
function hasStrategy() {
	const s = getStrategy();
	return !!(s && s.victory_goal);
}

/** The chat transcript for this game: [{role:'user'|'assistant', content}]. */
function getChatLog() { return _slot().chat.slice(); }

/** Append one message to this game's chat transcript. */
function appendChat(role, content) {
	_slot().chat.push({ role, content: String(content == null ? "" : content) });
	persist();
}

function clearGame() {
	delete MEM.byGame[gameId()];
	persist();
}

// --- brain bridge -----------------------------------------------------------
// fetch with a hard timeout (the runtime has fetch but no AbortController-by-
// default ergonomics we rely on; mirror the proven sidecar bridge pattern).
function withTimeout(promise, ms) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
		promise.then(
			(v) => { clearTimeout(timer); resolve(v); },
			(e) => { clearTimeout(timer); reject(e); },
		);
	});
}

/**
 * Send a chat turn to the brain. Returns { reply, strategy } on success, or null
 * if the server is unreachable / errored (caller shows an offline notice).
 * On success the returned strategy is cached via setStrategy().
 */
async function sendChat(message, state) {
	const body = {
		game_id: gameId(),
		message: String(message || ""),
		state: state || {},
		history: getChatLog(),
	};
	try {
		const resp = await withTimeout(fetch(`${SERVER_URL}/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}), CHAT_TIMEOUT_MS);
		if (!resp || !resp.ok) {
			console.warn(`[ai-advisor] /chat returned ${resp && resp.status}`);
			return null;
		}
		const data = await resp.json();
		if (data && data.strategy) setStrategy(data.strategy);
		return data;
	} catch (err) {
		console.warn(`[ai-advisor] brain unreachable: ${err}`);
		return null;
	}
}

/** Lightweight liveness check for the brain server. */
async function brainOnline() {
	try {
		const resp = await withTimeout(fetch(`${SERVER_URL}/health`), 3000);
		return !!(resp && resp.ok);
	} catch (e) {
		return false;
	}
}

export {
	safe, SERVER_URL,
	gameId, getStrategy, setStrategy, hasStrategy, clearGame,
	getChatLog, appendChat,
	sendChat, brainOnline,
};
