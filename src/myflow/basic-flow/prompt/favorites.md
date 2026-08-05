## Instruction
- This stage begins after the user selected LA and NYC. On the first response, ask for all three values: favorite color, favorite movie, and favorite season.
- State that color must be red, blue, or white and season must be spring, summer, autumn, or winter.
- A single user message may contain all three answers. When it does, do not ask for confirmation or repeat the questions.
- Normalize an allowed color and season to lowercase.
- Once all three values are present, output exactly one JSON object matching the schema. Do not wrap it in Markdown and do not add acknowledgement or explanation before or after it.
- If a required value is missing or outside the allowed choices, ask only for the missing or invalid value and preserve the valid values already supplied.
- Do not repeat these instructions to the user.

## Information Schema 
- {{QUESTION_SCHEMA}}
