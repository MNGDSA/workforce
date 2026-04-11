import { allSuites, type TestSuite } from "./suites";

type RunTestFn = (params: {
  testPlan: string;
  relevantTechnicalDocumentation?: string;
  defaultScreenWidth?: number;
  defaultScreenHeight?: number;
}) => Promise<{
  status: "success" | "failure" | "unable" | "skipped" | "blocked" | "error";
  testOutput: string;
  subagentId: string;
  screenshotPaths: string[];
}>;

type TestResult = {
  suite: string;
  status: string;
  output: string;
  screenshots: string[];
};

export async function runAllSuites(runTest: RunTestFn): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const suite of allSuites) {
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
        screenshots: result.screenshotPaths,
      });

      const icon = result.status === "success" ? "PASS" : "FAIL";
      console.log(`[${icon}] ${suite.name}: ${result.status}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        suite: suite.name,
        status: "error",
        output: msg,
        screenshots: [],
      });
      console.log(`[ERROR] ${suite.name}: ${msg}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("TEST RESULTS SUMMARY");
  console.log("=".repeat(60));

  for (const r of results) {
    const icon = r.status === "success" ? "PASS" : r.status === "failure" ? "FAIL" : "ERR ";
    console.log(`  [${icon}] ${r.suite}`);
  }

  const passed = results.filter((r) => r.status === "success").length;
  const total = results.length;
  console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${total - passed}`);

  return results;
}

export async function runSuite(runTest: RunTestFn, suiteName: string): Promise<TestResult> {
  const suite = allSuites.find((s) => s.name.toLowerCase().includes(suiteName.toLowerCase()));
  if (!suite) {
    throw new Error(`Suite not found: ${suiteName}. Available: ${allSuites.map((s) => s.name).join(", ")}`);
  }

  console.log(`Running: ${suite.name}`);
  const result = await runTest({
    testPlan: suite.testPlan,
    relevantTechnicalDocumentation: suite.technicalDocs,
  });

  const icon = result.status === "success" ? "PASS" : "FAIL";
  console.log(`[${icon}] ${suite.name}: ${result.status}`);

  return {
    suite: suite.name,
    status: result.status,
    output: result.testOutput,
    screenshots: result.screenshotPaths,
  };
}
