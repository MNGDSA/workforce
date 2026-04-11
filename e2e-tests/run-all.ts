import type { TestSuite, TestResult } from "./types";
import { AUTH_VALIDATION_SUITE } from "./auth-validation.spec";
import { CANDIDATE_PORTAL_LOGIN_SUITE } from "./candidate-portal-login.spec";
import { INBOX_ATTENDANCE_REVIEW_SUITE } from "./inbox-attendance-review.spec";
import { GEOFENCE_MANAGEMENT_SUITE } from "./geofence-management.spec";

export const ALL_SUITES: TestSuite[] = [
  AUTH_VALIDATION_SUITE,
  CANDIDATE_PORTAL_LOGIN_SUITE,
  INBOX_ATTENDANCE_REVIEW_SUITE,
  GEOFENCE_MANAGEMENT_SUITE,
];

export async function runAllSuites(
  runTest: (params: { testPlan: string; relevantTechnicalDocumentation?: string }) => Promise<{
    status: string;
    testOutput: string;
    screenshotPaths: string[];
  }>
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const suite of ALL_SUITES) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Running: ${suite.name}`);
    console.log("=".repeat(60));

    try {
      const result = await runTest({
        testPlan: suite.testPlan,
        relevantTechnicalDocumentation: suite.technicalDocs,
      });

      results.push({
        suite: suite.name,
        status: result.status,
        output: result.testOutput,
        screenshotPaths: result.screenshotPaths,
      });

      console.log(`Result: ${result.status}`);
    } catch (err) {
      results.push({
        suite: suite.name,
        status: "error",
        output: String(err),
      });
      console.log(`Error: ${err}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("TEST RESULTS SUMMARY");
  console.log("=".repeat(60));
  for (const r of results) {
    const icon = r.status === "success" ? "PASS" : r.status === "failure" ? "FAIL" : "ERROR";
    console.log(`  [${icon}] ${r.suite}`);
  }
  const passed = results.filter(r => r.status === "success").length;
  const failed = results.filter(r => r.status !== "success").length;
  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  return results;
}
