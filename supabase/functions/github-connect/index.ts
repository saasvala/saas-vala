import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GitHubAccount {
  name: string;
  email: string;
  token: string;
}

function getGitHubAccounts(): GitHubAccount[] {
  const accounts: GitHubAccount[] = [];

  const saasEmail = Deno.env.get("SAASVALA_GITHUB_EMAIL");
  const saasToken = Deno.env.get("SAASVALA_GITHUB_TOKEN");
  if (saasEmail && saasToken) {
    accounts.push({ name: "SaaSVala", email: saasEmail, token: saasToken });
  }

  const softEmail = Deno.env.get("SOFTWAREVALA_GITHUB_EMAIL");
  const softToken = Deno.env.get("SOFTWAREVALA_GITHUB_TOKEN");
  if (softEmail && softToken) {
    accounts.push({ name: "SoftwareVala", email: softEmail, token: softToken });
  }

  return accounts;
}

async function fetchUserInfo(token: string) {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "SaaSVala-Platform",
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchAllRepos(token: string) {
  const allRepos: any[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "SaaSVala-Platform",
        },
      }
    );
    if (!res.ok) break;
    const repos = await res.json();
    if (repos.length === 0) break;
    allRepos.push(...repos);
    if (repos.length < 100) break;
    page++;
  }

  return allRepos;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, accountName } = await req.json();
    const accounts = getGitHubAccounts();

    if (accounts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No GitHub accounts configured. Contact admin." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: status - get connected accounts info
    if (action === "status") {
      const accountsInfo = [];
      for (const acc of accounts) {
        const user = await fetchUserInfo(acc.token);
        accountsInfo.push({
          name: acc.name,
          email: acc.email,
          connected: !!user,
          login: user?.login || null,
          avatar_url: user?.avatar_url || null,
          public_repos: user?.public_repos || 0,
          total_private_repos: user?.total_private_repos || 0,
        });
      }

      return new Response(
        JSON.stringify({ success: true, accounts: accountsInfo }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: repos - fetch all repos from one or all accounts
    if (action === "repos") {
      const targetAccounts = accountName
        ? accounts.filter((a) => a.name === accountName)
        : accounts;

      const allRepos: any[] = [];

      for (const acc of targetAccounts) {
        const repos = await fetchAllRepos(acc.token);
        for (const repo of repos) {
          allRepos.push({
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            private: repo.private,
            html_url: repo.html_url,
            description: repo.description,
            default_branch: repo.default_branch,
            updated_at: repo.updated_at,
            language: repo.language,
            stargazers_count: repo.stargazers_count,
            open_issues_count: repo.open_issues_count,
            account: acc.name,
          });
        }
      }

      // Sort by most recently updated
      allRepos.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      return new Response(
        JSON.stringify({
          success: true,
          totalRepos: allRepos.length,
          repos: allRepos,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("github-connect error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
