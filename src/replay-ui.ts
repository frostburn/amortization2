// Vite removes these controls from production builds.
export const replayControls = import.meta.env.DEV ? `<div class="replay-controls"><button data-open-replay>VIEW REPLAY</button><button data-export-replay>EXPORT HUMAN REPLAY</button><small data-replay-error role="alert"></small><small class="replay-recording-status">Development recording · JSON</small></div>` : "";
