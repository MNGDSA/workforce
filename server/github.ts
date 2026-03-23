// GitHub integration via Replit Connectors SDK
// Connection: conn_github_01KMCD4T6871ZX6CKTKY6BG2YA
// Permissions: repo, read:org, read:project, read:user, user:email
// Docs: https://docs.github.com/en/rest

import { ReplitConnectors } from "@replit/connectors-sdk";

function getConnectors() {
  return new ReplitConnectors();
}

export async function githubRequest<T = unknown>(
  endpoint: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const connectors = getConnectors();
  const response = await connectors.proxy("github", endpoint, {
    method: options.method ?? "GET",
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  return response.json() as Promise<T>;
}

export async function getAuthenticatedUser() {
  return githubRequest<{ login: string; name: string; email: string; avatar_url: string }>("/user");
}

export async function listUserRepos() {
  return githubRequest<{ id: number; name: string; full_name: string; private: boolean; html_url: string; description: string | null; default_branch: string }[]>(
    "/user/repos?sort=updated&per_page=50"
  );
}

export async function getRepo(owner: string, repo: string) {
  return githubRequest(`/repos/${owner}/${repo}`);
}

export async function listRepoIssues(owner: string, repo: string) {
  return githubRequest(`/repos/${owner}/${repo}/issues?state=open`);
}

export async function listRepoPullRequests(owner: string, repo: string) {
  return githubRequest(`/repos/${owner}/${repo}/pulls?state=open`);
}
