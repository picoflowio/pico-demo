/*
 * Created on Sun Mar 16 2025
 *
 * Copyright (c) 2025 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { readFileSync } from 'fs';
import * as path from 'path';

export class DemoPrompt {
  public static TravelRole = readFileSync(
    path.join(__dirname, 'role.md'),
    'utf-8',
  );

  public static AbruptEnd = `
   Nicely tell the user this is the end of conversation as they requested, you MUST NOT talk other things!
  `.trim();

  public static FromAddressEnd = `
  Tell the user you have collected the address and end the conversation.
 `.trim();
}
