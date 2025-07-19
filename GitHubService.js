import axios from 'axios';
import ChatCommandService from "@token-ring/registry/ChatCommandRegistry.js";
import GitHubCommand from "./commands/github.js";

import { Service } from "@token-ring/registry";
export default class GitHubService extends Service {
 name = "GitHubService";
 description = "Provides GitHub functionality";
 static constructorProperties = {
  clientId: {
   type: "string",
   required: true,
   description: "GitHub OAuth client ID"
  },
  clientSecret: {
   type: "string",
   required: true,
   description: "GitHub OAuth client secret"
  },
  redirectUri: {
   type: "string",
   required: true,
   description: "OAuth redirect URI"
  },
  token: {
   type: "string",
   required: false,
   description: "GitHub personal access token for authentication"
  },
  owner: {
   type: "string",
   required: false,
   description: "GitHub repository owner (user or organization)"
  },
  repo: {
   type: "string",
   required: false,
   description: "GitHub repository name"
  },
  branch: {
   type: "string",
   required: false,
   description: "GitHub branch name, defaults to 'main'"
  }
 };

 constructor({ clientId, clientSecret, redirectUri, token, owner, repo, branch }) {
  super();
  if (!clientId) {
   throw new Error("GitHubService requires a clientId.");
  }
  if (!clientSecret) {
   throw new Error("GitHubService requires a clientSecret.");
  }
  if (!redirectUri) {
   throw new Error("GitHubService requires a redirectUri.");
  }

  this.clientId = clientId;
  this.clientSecret = clientSecret;
  this.redirectUri = redirectUri;
  this.token = token || null;
  this.owner = owner || null;
  this.repo = repo || null;
  this.branch = branch || "main";
  this.userInfo = null;
 }

 async start(registry) {
  if (!this.token) {
   console.log('No access token available. Use "github login" to authenticate.');
   return;
  }

  try {
   await this.fetchUserInfo();
  } catch (error) {
   console.error('Failed to validate GitHub token:', error);
   console.log('Please use "github login" to re-authenticate.');
   this.token = null;
  }

  const chatCommandService = registry.requireFirstServiceByType(ChatCommandService);

  chatCommandService.registerCommand("github", new GitHubCommand({owner: this}));
 }

 async stop(registry) {
  const chatCommandService = registry.requireFirstServiceByType(ChatCommandService);
  chatCommandService.unregisterCommand("github");
 }
 
 /**
  * Reports the status of the service.
  * @param {TokenRingRegistry} registry - The package registry
  * @returns {Object} Status information.
  */
 async status(registry) {
  return {
   active: true,
   service: "GitHubService"
  };
 }

 getAuthorizationUrl() {
  const scope = encodeURIComponent('repo user');
  return `https://github.com/login/oauth/authorize?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${scope}`;
 }

 async exchangeCodeForToken(code) {
  const tokenUrl = 'https://github.com/login/oauth/access_token';
  const params = {
   client_id: this.clientId,
   client_secret: this.clientSecret,
   code: code,
   redirect_uri: this.redirectUri
  };

  try {
   const response = await axios.post(tokenUrl, params, {
    headers: {
     'Accept': 'application/json'
    }
   });

   const data = response.data;
   if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
   }

   this.token = data.access_token;
   console.log('GitHub token obtained successfully.');

   await this.fetchUserInfo();
   return true;
  } catch (error) {
   console.error('Error exchanging authorization code for token:', error.response ? error.response.data : error.message);
   throw error;
  }
 }

 async fetchUserInfo() {
  if (!this.token) {
   throw new Error('No access token available.');
  }

  try {
   const response = await axios.get('https://api.github.com/user', {
    headers: {
     'Authorization': `token ${this.token}`,
     'Accept': 'application/vnd.github.v3+json'
    }
   });

   this.userInfo = response.data;
   console.log(`Authenticated as ${this.userInfo.login}`);
   return this.userInfo;
  } catch (error) {
   console.error('Error fetching GitHub user info:', error.response ? error.response.data : error.message);
   throw error;
  }
 }

 getToken() {
  return this.token;
 }

 getOwner() {
  return this.owner || (this.userInfo ? this.userInfo.login : null);
 }

 getRepo() {
  return this.repo;
 }

 getBranch() {
  return this.branch;
 }

 setOwner(owner) {
  this.owner = owner;
 }

 setRepo(repo) {
  this.repo = repo;
 }

 setBranch(branch) {
  this.branch = branch;
 }

 isAuthenticated() {
  return !!this.token;
}

async searchRepositories(query, limit = 10) {
  if (!this.token) {
    throw new Error('No access token available. Please authenticate first.');
  }

  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await axios.get(`https://api.github.com/search/repositories?q=${encodedQuery}&per_page=${limit}`, {
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    return response.data.items.map(item => ({
      name: item.name,
      fullName: item.full_name,
      description: item.description,
      url: item.html_url,
      stars: item.stargazers_count,
      forks: item.forks_count,
      language: item.language
    }));
  } catch (error) {
    console.error('Error searching GitHub repositories:', error.response ? error.response.data : error.message);
    throw error;
  }
}
}
