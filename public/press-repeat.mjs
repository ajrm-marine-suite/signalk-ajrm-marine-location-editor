/**
 * Adds tap, keyboard and press-and-hold repetition to a map editing button.
 */

export function bindPressRepeat(button, action, {
	initialDelayMs = 450,
	repeatIntervalMs = 120,
	setTimeoutFn = globalThis.setTimeout,
	clearTimeoutFn = globalThis.clearTimeout,
	setIntervalFn = globalThis.setInterval,
	clearIntervalFn = globalThis.clearInterval,
} = {}) {
	let delayTimer = null;
	let repeatTimer = null;
	let repeatCount = 0;

	const invoke = (isRepeat = false) => {
		if (isRepeat) repeatCount += 1;
		action({ isRepeat, repeatCount });
	};

	const stop = (event) => {
		if (delayTimer !== null) clearTimeoutFn(delayTimer);
		if (repeatTimer !== null) clearIntervalFn(repeatTimer);
		delayTimer = null;
		repeatTimer = null;
		if (event?.pointerId !== undefined && button.hasPointerCapture?.(event.pointerId)) {
			button.releasePointerCapture(event.pointerId);
		}
	};

	const pointerDown = (event) => {
		if (event.button !== undefined && event.button !== 0) return;
		event.preventDefault?.();
		stop();
		button.setPointerCapture?.(event.pointerId);
		repeatCount = 0;
		invoke();
		delayTimer = setTimeoutFn(() => {
			delayTimer = null;
			repeatTimer = setIntervalFn(() => invoke(true), repeatIntervalMs);
		}, initialDelayMs);
	};

	const click = (event) => {
		// Mouse and touch clicks follow pointerdown, which already performed the
		// first step. Keyboard/programmatic clicks have detail zero.
		if (Number(event.detail) > 0) event.preventDefault?.();
		else {
			repeatCount = 0;
			invoke();
		}
	};

	button.addEventListener("pointerdown", pointerDown);
	button.addEventListener("pointerup", stop);
	button.addEventListener("pointercancel", stop);
	button.addEventListener("lostpointercapture", stop);
	button.addEventListener("click", click);

	return () => {
		stop();
		button.removeEventListener("pointerdown", pointerDown);
		button.removeEventListener("pointerup", stop);
		button.removeEventListener("pointercancel", stop);
		button.removeEventListener("lostpointercapture", stop);
		button.removeEventListener("click", click);
	};
}
