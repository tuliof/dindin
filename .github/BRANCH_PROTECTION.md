# Main Branch Protection

The repository workflow can define and report the `Full validation` check, but repository files cannot enable GitHub branch protection. A repository maintainer must configure a ruleset or branch protection rule for `main` that requires pull requests and the `Full validation` status check before merging.

Until that external setting is enabled, the workflow is informative rather than a merge gate. This is an infrastructure blocker for issue #63, not something an application commit can resolve.

Bypasses are intentionally repository-auditable: a commit must contain a `Delivery-Gate-Bypass-Reason: ...` trailer. The workflow does not expose a manual dispatch bypass.
