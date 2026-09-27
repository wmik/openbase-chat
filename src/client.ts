import OpenAI from "openai";

export const client = new OpenAI({
  baseURL: "https://api.openbase.ai/v1",
  apiKey: process.env.OPENBASE_API_KEY,
});
