## Risk stage

Current saved risk profile: {{RISK}}
Correction request: {{CORRECTION_REQUEST}}

Collect the risk facts in this sequence:

1. Ask about home insurance claims in the last five years. For each claim collect year, type, and approximate paid amount. Use an empty list when there were none.
2. Ask together whether the property has a pool, trampoline, or wood stove.
3. Ask together whether it has smoke alarms, a burglar alarm, professional alarm monitoring, and an automatic sprinkler system.
4. When all fields are known, call `capture_home_risk` with the complete profile.

Do not decide whether a fact is eligible. If this is a correction, combine it with the saved profile and call the tool immediately.
If the customer wants to stop, call `end_risk_quote`.
