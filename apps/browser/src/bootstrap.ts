// SPDX-License-Identifier: GPL-3.0-or-later
import { GraphicsUnavailableError } from "./graphics";
import "./style.css";

// Stop before networking and input handlers are installed when graphics fail.
import("./main").catch((error) => {
  if (!(error instanceof GraphicsUnavailableError)) throw error;
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<main class="graphics-error panel" role="alert" aria-labelledby="graphics-title">
    <div class="kicker">Browser playground</div>
    <h1 id="graphics-title">3D graphics are unavailable</h1>
    <p>This browser could not start WebGL 2, which the playground needs to draw the world.</p>
    <p>In the cloud desktop, open the game from the project terminal with <code>npm run open:poc</code>. This opens a dedicated browser window with software graphics enabled.</p>
    <p>On your own computer, enable graphics acceleration in your browser settings and restart the browser, or try another browser that supports WebGL 2.</p>
    <button class="primary" id="retry-graphics">Try again</button>
    <details><summary>Graphics details</summary><pre id="graphics-details"></pre></details>
</main>`;
  document.getElementById("graphics-details")!.textContent = error.message;
  document
    .getElementById("retry-graphics")!
    .addEventListener("click", () => location.reload());
});
