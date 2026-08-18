/**
 * Verifies tap, keyboard and press-and-hold geometry button behaviour.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

test("movement arrows repeat after a deliberate hold and stop on release", async () => {
	const { bindPressRepeat } = await import("../public/press-repeat.mjs");
	const listeners = new Map();
	const timeouts = new Map();
	const intervals = new Map();
	let timerId = 0;
	let moves = 0;
	const contexts = [];
	const button = {
		addEventListener: (name, handler) => listeners.set(name, handler),
		removeEventListener: (name) => listeners.delete(name),
		setPointerCapture() {},
		hasPointerCapture: () => false,
	};
	bindPressRepeat(button, (context) => { moves += 1; contexts.push(context); }, {
		setTimeoutFn: (handler) => { const id = ++timerId; timeouts.set(id, handler); return id; },
		clearTimeoutFn: (id) => timeouts.delete(id),
		setIntervalFn: (handler) => { const id = ++timerId; intervals.set(id, handler); return id; },
		clearIntervalFn: (id) => intervals.delete(id),
	});

	listeners.get("pointerdown")({ button: 0, pointerId: 1, preventDefault() {} });
	assert.equal(moves, 1, "press performs one immediate movement");
	[...timeouts.values()][0]();
	[...intervals.values()][0]();
	[...intervals.values()][0]();
	assert.equal(moves, 3, "held press repeats movement");
	assert.deepEqual(contexts.slice(0, 3).map(({ repeatCount }) => repeatCount), [0, 1, 2]);
	listeners.get("pointerup")({ pointerId: 1 });
	assert.equal(intervals.size, 0, "release stops repetition");

	listeners.get("click")({ detail: 0, preventDefault() {} });
	assert.equal(moves, 4, "keyboard activation still moves once");
	listeners.get("click")({ detail: 1, preventDefault() {} });
	assert.equal(moves, 4, "pointer click does not duplicate pointerdown");
});
