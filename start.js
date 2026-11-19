import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env")) loadEnvFile(".env");
const { default: app } = await import("./app.js");
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log("LASLAS 24 listening on port " + port));
