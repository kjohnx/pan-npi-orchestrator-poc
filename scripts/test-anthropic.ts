import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set.");
    process.exit(1);
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 128,
      temperature: 0,
      messages: [{ role: "user", content: "Say hello" }],
    }),
  });

  const text = await response.text();
  console.log("Status:", response.status, response.statusText);
  console.log("Body:", text);
}

main().catch((error) => {
  console.error("Request failed:", error);
  process.exit(1);
});
