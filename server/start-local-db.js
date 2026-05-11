/**
 * Run from repo root: npm run start:local-db
 * Uses MySQL on localhost:3307 (Docker Compose maps host 3307 → container 3306).
 * Sets env before dotenv/config so .env does not override these keys.
 */
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3307";
require("./app.js");
