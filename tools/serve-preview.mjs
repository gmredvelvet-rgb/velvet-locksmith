import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve, sep, extname} from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const types = {".js":"text/javascript", ".css":"text/css", ".html":"text/html", ".json":"application/json"};
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = resolve(root, `.${path === "/" ? "/tools/preview.html" : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep) || !types[extname(file)]) {res.writeHead(403); res.end(); return;}
    const body = await readFile(file);
    res.writeHead(200, {"Content-Type": types[extname(file)], "Cache-Control":"no-store"}); res.end(body);
  } catch {res.writeHead(404); res.end("Not found");}
}).listen(38641, "127.0.0.1", () => console.log("Preview: http://127.0.0.1:38641"));
