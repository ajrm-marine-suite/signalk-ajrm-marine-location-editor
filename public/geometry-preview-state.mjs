/** Decides whether an unsaved geometry preview belongs on the chart. */

export function shouldRenderGeometryPreview({
	dirty = false,
	editorOpen = false,
	geometryEditorOpen = false,
} = {}) {
	return dirty === true && (editorOpen === true || geometryEditorOpen === true);
}
