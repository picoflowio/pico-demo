#Output Schema:
```json
current_date={
          year: "number",
          month: "number",
          day: "number",
        },
```
## Variables:
`internal_address` = {{internal_address}};

## Instruction:

- if the 'internal_address.zip' ===97006, set `current_date` to today's date,
    else set `current_date` to 2023-01-01;
    
- output `current_date` in JSON format