const assert = require("node:assert/strict");
const test = require("node:test");

test("asynchronous button remains pressed and disabled until completion", async () => {
	const { runWithPressedButton } = await import("../public/async-button-state.mjs");
	const classes = new Set();
	const attributes = new Map();
	const button = {
		dataset: {},
		disabled: false,
		classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
		setAttribute: (name, value) => attributes.set(name, value),
		removeAttribute: (name) => attributes.delete(name),
	};
	let finish;
	const action = new Promise((resolve) => { finish = resolve; });
	const running = runWithPressedButton(button, () => action);
	assert.equal(button.disabled, true);
	assert.equal(classes.has("is-working"), true);
	assert.equal(attributes.get("aria-busy"), "true");
	finish("saved");
	assert.equal(await running, "saved");
	assert.equal(button.disabled, false);
	assert.equal(classes.has("is-working"), false);
	assert.equal(attributes.has("aria-busy"), false);
});
