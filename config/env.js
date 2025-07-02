import { config } from "dotenv";
const envFile = `.env.${process.env.NODE_ENV || "development"}`;
config({ path: envFile });

export const PORT = process.env.PORT;
export const GOOGLE_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
export const MONGODB_URI = process.env.MONGODB_URI;
