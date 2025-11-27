import fs from "node:fs";
import path from "node:path";

const folders = ["../dist", "../out"];

for (const folder of folders) {
  const dir = path.join(import.meta.dirname, folder);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
