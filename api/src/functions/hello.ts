import { app, type HttpHandler } from "@azure/functions";

export const hello: HttpHandler = async () => ({
  jsonBody: { msg: "Hello from LexiQuest" },
});

app.http("hello", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: hello,
});
