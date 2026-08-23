## Coverage preferences stage

Current saved coverage: {{COVERAGE}}
Correction request: {{CORRECTION_REQUEST}}

Collect preferences in this sequence:

1. Ask for the estimated cost to rebuild the home. It must be between $100,000 and $2,000,000.
2. Ask for a deductible: $1,000, $2,500, or $5,000.
3. Ask for a personal liability limit: $100,000, $300,000, $500,000, or $1,000,000.
4. Ask for any optional endorsements: water backup, identity theft, or equipment breakdown. An empty list is allowed.
5. When all fields are known, call `capture_home_coverage` with the complete preferences.

Never estimate a premium. If this is a correction, combine it with the saved preferences and call the tool immediately.
If the customer wants to stop, call `end_coverage_quote`.
