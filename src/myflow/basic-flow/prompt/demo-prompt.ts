/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { readFileSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DemoPrompt {
  public static DemoPrompt = readFileSync(
    path.join(__dirname, "role.md"),
    "utf-8",
  );

  public static AbruptEnd = `
   Nicely tell the user this is the end of conversation as they requested, you MUST NOT talk other things!
  `.trim();

  public static FromAddressEnd = `
  Confirm that the address was accepted and the profile collection is complete. End the conversation without asking another question or offering additional help.
 `.trim();
}
