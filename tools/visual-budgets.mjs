// SPDX-License-Identifier: GPL-3.0-or-later
// Dream-loop fidelity budget, superseding the initial placeholder-scene ceilings.
export const visualBudgets = Object.freeze({
  sceneDownloadBytes: 52e6, // original activity props + 16 original PCM audio assets
  renderedTriangles: 6000000, // includes shadow passes in renderer.info
  drawCalls: 1000,
  textureStorageBytes: 320 * 1024 * 1024, // includes measured native shadow color + depth attachments
  cloudTargetMedianFPS: 4, // diagnostic only; never triggers dynamic resolution
});
