/**
 * The board page's script, sent as text (the page loads nothing else). It asks the server for nothing: the server
 * pushes the whole board over /events whenever it changes. Every value from the logs is set with textContent.
 * Written without template literals so it can live inside these strings; the arithmetic is page-math.ts, sent as its
 * own tested source.
 */
import { CLIENT_END } from "./client-end.js";
import { CLIENT_START } from "./client-start.js";
import { CLIENT_WATCH } from "./client-watch.js";
import { PAGE_MATH } from "./page-math.js";
import { WATCH_VIEW } from "./watch-view.js";

export const CLIENT = `${CLIENT_START}\n${PAGE_MATH}\n${WATCH_VIEW}\n${CLIENT_WATCH}\n${CLIENT_END}`;
