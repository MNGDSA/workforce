export type TestSuite = {
  name: string;
  testPlan: string;
  technicalDocs: string;
  knownIssues?: string[];
};

export type RunTestFn = (params: {
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

export type TestResult = {
  suite: string;
  status: string;
  output?: string;
  screenshotPaths?: string[];
};
