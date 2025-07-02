import { config } from "dotenv";
const envFile = `.env.${process.env.NODE_ENV || "development"}`;
config({ path: envFile });

export const PORT = process.env.PORT;
export const MONGODB_URI = process.env.MONGODB_URI;
export const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
export const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
export const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
