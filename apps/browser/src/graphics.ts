// SPDX-License-Identifier: GPL-3.0-or-later
import { WebGLRenderer } from 'three';

export class GraphicsUnavailableError extends Error {}

export function createRenderer(): WebGLRenderer {
    const canvas = document.createElement('canvas');
    let reason = 'The browser did not provide a WebGL 2 context.';
    canvas.addEventListener('webglcontextcreationerror', event => {
        reason = (event as WebGLContextEvent).statusMessage || reason;
    });
    try {
        // Use the same context for the check and renderer: a separate probe
        // would allocate another GPU context and could pass while this one fails.
        const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
        if (!context) throw new Error(reason);
        return new WebGLRenderer({ canvas, context, antialias: true });
    } catch (error) {
        throw new GraphicsUnavailableError(error instanceof Error ? error.message : reason);
    }
}
