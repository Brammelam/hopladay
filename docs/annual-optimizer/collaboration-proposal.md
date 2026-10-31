# Shared leave planning: separate follow-up

This release optimizes one person's working calendar and leave allowance. It does not expose personal calendars to another account.

A shared planner would classify each date separately for each participant, generate mutually available intervals and charge each participant only their own workdays. It needs a vector of leave costs and a budget per person; optimizing two separate plans and intersecting them is insufficient. A two-person exact solver can add a second budget dimension to the interval DP, with explicit practical bounds and small-calendar exhaustive tests. The state space grows with both budgets; benchmark before promising full-year interactive results.

Invitations must identify the other account, require acceptance, and define whether the participants share only availability or actual leave details. Authorization must cover every shared-plan read and change; public user IDs are not proof of access. Either person must be able to leave and revoke future access. Do not imply synchronization submits a leave request to an employer.

Proposed first scope: two verified accounts, mutually available periods, independent leave budgets, explicit opt-in sharing and one saved shared snapshot. Payroll integrations, team permissions and automatic employer requests are separate decisions. No collaborative feature or new entitlement is shipped by this proposal.
