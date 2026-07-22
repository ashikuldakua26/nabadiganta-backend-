const { spawn } = require("child_process");
const path = require("path");

function stopProcessesOnPort(port) {
  return new Promise((resolve) => {
    const command = process.platform === "win32" ? "powershell.exe" : "sh";
    const args = process.platform === "win32"
      ? [
          "-NoProfile",
          "-Command",
          `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`,
        ]
      : ["-lc", `lsof -ti tcp:${port} | xargs -r kill -9`];

    const child = spawn(command, args, { stdio: "ignore" });
    child.on("exit", () => resolve());
    child.on("error", () => resolve());
  });
}

async function main() {
  const port = process.env.PORT || 5000;
  await stopProcessesOnPort(port);
  await new Promise((resolve) => setTimeout(resolve, 500));

  const backendPath = path.join(__dirname, "..", "index.js");
  const child = spawn(process.execPath, [backendPath], {
    cwd: path.join(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error("Failed to start backend:", error.message);
  process.exit(1);
});
