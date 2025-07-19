
/**
 * GitHub command handler.
 */
import ChatService from "@token-ring/chat/ChatService";
import open from 'open';


  export const description = "GitHub commands for authentication and repository management";

  export async function execute(remainder, registry) {
    const githubService = this.owner;
    const chatService = registry.getFirstServiceByType(ChatService);
    const args = remainder ? remainder.trim().split(/\s+/) : [];

    if (!args.length) {
      if (githubService.isAuthenticated()) {
        console.log(`Authenticated to GitHub${githubService.userInfo ? ` as ${githubService.userInfo.login}` : ''}`);

        if (githubService.getOwner() && githubService.getRepo()) {
          console.log(`Current repository: ${githubService.getOwner()}/${githubService.getRepo()} (branch: ${githubService.getBranch()})`);
        }
      } else {
        console.log('Not authenticated to GitHub');
      }
      this.help();
      return;
    }

    const subcommand = args[0];

    switch(subcommand) {
      case "login":
        await handleLogin(githubService);
        break;
      case "auth":
        if (args.length > 1) {
          const code = args[1];
          await handleAuth(code, githubService);
        } else {
          console.log('Error: Missing authorization code');
          console.log('Usage: github auth <code>');
        }
        break;
      case "search":
        if (chatService) {
          const searchQuery = args.slice(1).join(' ');
          await handleSearch(searchQuery, githubService, chatService);
        } else {
          console.log('Error: ChatService not found. Please add it to your context configuration.');
        }
        break;
      default:
        console.log(`Unknown subcommand: ${subcommand}`);
        this.help();
    }
  }

export function help() {
 return [
  "  github                             - Show current GitHub authentication status",
  "  github login                       - Open browser to authenticate with GitHub",
  "  github auth <code>                 - Complete authentication with the code from GitHub",
  "  github repo <owner> <repo> [branch] - Set the current GitHub repository",
  "  github search <query>              - Search for repositories on GitHub"
 ]
}

/**
 * Handle the login process by opening the GitHub OAuth authorization URL in the browser.
 * @param {GitHubService} githubService
 */
async function handleLogin(githubService) {
 try {
  const authUrl = githubService.getAuthorizationUrl();
  console.log('Opening browser for GitHub OAuth authorization...');
  console.log('After authorizing, you will receive a code. Use "github auth <code>" to complete authentication.');
  await open(authUrl);
 } catch (error) {
  console.error('Error during GitHub login:', error);
 }
}

/**
 * Handle the authentication process by exchanging the code for a token.
 * @param {string} code
 * @param {GitHubService} githubService
 */
async function handleAuth(code, githubService) {
 try {
  await githubService.exchangeCodeForToken(code);
  console.log('Authentication successful. You are now logged in to GitHub.');
 } catch (error) {
  console.error('Error during GitHub authentication:', error);
 }
}

/**
 * Handle the search functionality by querying GitHub repositories.
 * @param {string} query - The search query
 * @param {GitHubService} githubService - The GitHub context
 * @param {ChatService} chatService - The chat context for displaying results
 */
async function handleSearch(query, githubService, chatService) {
 if (!query || !query.trim()) {
  chatService.errorLine("Usage: /github search <query>");
  return;
 }

 if (!githubService.isAuthenticated()) {
  chatService.errorLine("You need to be authenticated to search GitHub repositories. Use '/github login' to authenticate.");
  return;
 }

 try {
  chatService.systemLine(`Searching GitHub for: "${query}"...`);

  // Default limit to 10 results
  const limit = 10;
  const results = await githubService.searchRepositories(query, limit);

  if (results.length === 0) {
   chatService.systemLine("No results found.");
   return;
  }

  chatService.systemLine(`Found ${results.length} repository/repositories:`);

  // Display each result
  for (const repo of results) {
   chatService.systemLine(`📂 ${repo.fullName}:`);

   // Format the output to show repository details
   let details = [];
   if (repo.description) details.push(`Description: ${repo.description}`);
   if (repo.language) details.push(`Language: ${repo.language}`);
   details.push(`Stars: ${repo.stars} | Forks: ${repo.forks}`);
   details.push(`URL: ${repo.url}`);

   chatService.out(details.join("\n"));
   chatService.out("\n");
  }
 } catch (error) {
  chatService.errorLine(`Error during GitHub search: ${error.message}`);
  console.error("GitHub search command error:", error);
 }
}


