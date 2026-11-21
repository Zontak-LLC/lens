import { CLIENT } from "./client.js";
import { STYLE } from "./style.js";

/** The one page Spyglass serves: the start page at "/" and a project's board at "/<project>" (the script decides). */
export function boardPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spyglass</title>
<style>${STYLE}</style>
</head>
<body>
<main class="wrap" id="app"><p class="empty">Connecting to Spyglass…</p></main>
<script>${CLIENT}</script>
</body>
</html>`;
}
