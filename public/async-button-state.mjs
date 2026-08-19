/**
 * Keeps a tactile action button visibly pressed and unavailable while its
 * asynchronous action is running, then restores its previous state.
 */

export async function runWithPressedButton(button, action) {
	if (!button || button.dataset?.ajrmBusy === "true") return undefined;
	const wasDisabled = button.disabled === true;
	button.dataset.ajrmBusy = "true";
	button.disabled = true;
	button.classList.add("is-working");
	button.setAttribute("aria-busy", "true");
	try {
		return await action();
	} finally {
		delete button.dataset.ajrmBusy;
		button.disabled = wasDisabled;
		button.classList.remove("is-working");
		button.removeAttribute("aria-busy");
	}
}
