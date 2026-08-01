import { describe, expect, test } from "bun:test";
import {
  aggregateChecks,
  mergePreconditionFailures,
  parsePullRequestReference,
  prStatusReport,
} from "./github-project";

describe("GitHub project PR helpers", () => {
  test("accepts PR numbers and GitHub PR URLs", () => {
    expect(parsePullRequestReference("42")).toBe("42");
    expect(
      parsePullRequestReference("https://github.com/tuliof/dindin/pull/42")
    ).toBe("42");
    expect(() =>
      parsePullRequestReference("https://github.com/tuliof/dindin/issues/42")
    ).toThrow("Invalid pull request reference");
  });

  test("aggregates completed, pending, and failed checks deterministically", () => {
    expect(
      aggregateChecks([
        {
          conclusion: "SUCCESS",
          detailsUrl: "https://example.invalid/unit",
          name: "unit",
          status: "COMPLETED",
        },
        { conclusion: null, name: "lint", status: "IN_PROGRESS" },
        { conclusion: "FAILURE", name: "build", status: "COMPLETED" },
      ])
    ).toEqual({
      failed: [
        {
          conclusion: "FAILURE",
          detailsUrl: null,
          name: "build",
          status: "COMPLETED",
        },
      ],
      pending: [
        {
          conclusion: null,
          detailsUrl: null,
          name: "lint",
          status: "IN_PROGRESS",
        },
      ],
      state: "failure",
    });
  });

  test("reports PR review and delivery fields", () => {
    expect(
      prStatusReport({
        baseRefOid: "base-sha",
        commits: [{ oid: "commit" }],
        headRefOid: "head-sha",
        isDraft: false,
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
        number: 42,
        reviewDecision: "APPROVED",
        state: "OPEN",
        statusCheckRollup: [],
        url: "https://github.com/tuliof/dindin/pull/42",
      })
    ).toMatchObject({
      baseSha: "base-sha",
      commitCount: 1,
      headSha: "head-sha",
      number: 42,
      reviewDecision: "APPROVED",
      validForReview: true,
    });
  });

  test("lists every merge precondition failure without calling GitHub", () => {
    expect(
      mergePreconditionFailures(
        {
          commits: [{ oid: "commit" }],
          isDraft: false,
          mergeable: "CONFLICTING",
          mergeStateStatus: "DIRTY",
          state: "OPEN",
          statusCheckRollup: [
            { conclusion: null, name: "pending", status: "IN_PROGRESS" },
            { conclusion: "FAILURE", name: "failed", status: "COMPLETED" },
          ],
        },
        "in-progress"
      )
    ).toEqual([
      "PR has pending checks",
      "PR has failed checks",
      "PR is not mergeable: CONFLICTING",
      "PR merge state is not clean: DIRTY",
      "Linked project task is not in review: in-progress",
    ]);
  });
});
