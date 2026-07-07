import { APP_HTML } from "./_lib/app-html.js";

export async function onRequestGet() {
  return new Response(APP_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}
