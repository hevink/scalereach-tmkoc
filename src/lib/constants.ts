export const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://localhost:5174",
  "https://app.scalereach.ai",
  "https://www.scalereach.ai",
  "https://scalereach.ai",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];
