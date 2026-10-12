import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import StatusBadge from "@tokenring-ai/one-frontend/components/ui/StatusBadge.tsx";
import TagChip from "@tokenring-ai/one-frontend/components/ui/TagChip.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import type { ViewProps } from "@tokenring-ai/one-frontend/dock/types.ts";
import { useBusyAction } from "@tokenring-ai/one-frontend/hooks/useBusyAction.ts";
import { useConfirmDialog } from "@tokenring-ai/one-frontend/hooks/useConfirmDialog.tsx";
import { githubRPCClient, useGitHubStatus } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { ExternalLink, KeyRound, Link2, Loader2, LogOut, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GITHUB_DASHBOARD_ID } from "../manifest.ts";

/** Give up polling for a sign-in the user never finished. */
const CONNECT_TIMEOUT_MS = 5 * 60 * 1000;

type AccountStatus = NonNullable<ReturnType<typeof useGitHubStatus>["data"]>["accounts"][number];

const AUTH_BADGES = {
  connected: { label: "Connected", dotColor: "bg-emerald-500", colorClass: "text-emerald-500" },
  disconnected: { label: "Not connected", dotColor: "bg-stone-400", colorClass: "text-muted" },
};

function AccountCard({
  account,
  hasOAuthClient,
  connecting,
  onConnect,
  onDisconnect,
}: {
  account: AccountStatus;
  hasOAuthClient: boolean;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const profile = account.profile;
  const canConnect = hasOAuthClient && !account.usesPersonalAccessToken;

  return (
    <li className="rounded-xl border border-primary bg-secondary p-4 space-y-3" data-testid={`github-account-${account.name}`}>
      <div className="flex items-start gap-3">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full bg-tertiary shrink-0" />
        ) : (
          <span className="w-10 h-10 rounded-full bg-tertiary flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4 text-muted" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-primary">{account.name}</h3>
            <StatusBadge status={account.isAuthenticated ? "connected" : "disconnected"} statuses={AUTH_BADGES} variant="inline" gap="sm" />
          </div>
          <p className="text-xs text-muted truncate">
            {profile?.login ?? account.login ?? "No GitHub login yet"}
            {profile?.name ? ` · ${profile.name}` : ""}
          </p>
          <p className="text-[11px] text-dim truncate">{account.baseUrl}</p>
        </div>
        {profile?.html_url && (
          <a href={profile.html_url} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-primary transition-colors" title="Open profile">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <TagChip
          label={account.usesPersonalAccessToken ? "Personal access token" : "OAuth"}
          showIcon={false}
          variant={account.usesPersonalAccessToken ? "sky" : "accent"}
        />
        {(account.grantedScopes ?? account.scopes).map(scope => (
          <TagChip key={scope} label={scope} showIcon={false} />
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {!account.isAuthenticated && canConnect && (
          <button
            type="button"
            onClick={onConnect}
            disabled={connecting}
            className="flex items-center gap-2 px-3 py-1.5 btn-accent text-xs font-semibold rounded-lg transition-colors focus-ring cursor-pointer disabled:opacity-50"
          >
            {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            {connecting ? "Waiting for GitHub…" : "Connect"}
          </button>
        )}
        {!account.isAuthenticated && !canConnect && !account.usesPersonalAccessToken && (
          <p className="text-xs text-muted">
            To sign in, paste a personal access token into this account in Configuration → GitHub → Accounts. Browser sign-in also works once an OAuth app is
            set up (see below).
          </p>
        )}
        {account.isAuthenticated && !account.usesPersonalAccessToken && (
          <button
            type="button"
            onClick={onDisconnect}
            className="flex items-center gap-2 px-3 py-1.5 border border-primary text-muted hover:text-red-500 hover:border-red-500/50 text-xs font-medium rounded-lg transition-colors focus-ring cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Disconnect
          </button>
        )}
      </div>
    </li>
  );
}

const GITHUB_CONFIG_HREF = `/configuration/${encodeURIComponent("@tokenring-ai/github")}`;

/** How to give TokenRing a GitHub account, in the order most people should try. */
function SetupSteps() {
  return (
    <ol className="list-decimal list-inside space-y-1 text-left">
      <li>
        <strong className="text-primary">Personal access token (simplest):</strong> on GitHub open Settings → Developer settings → Personal access tokens,
        create a token with the <code>repo</code> scope, then add an account in Configuration → GitHub → Accounts and paste the token.
      </li>
      <li>
        <strong className="text-primary">Sign in with GitHub (OAuth):</strong> create an OAuth app on GitHub, enter its client ID and secret in Configuration →
        GitHub, add an account, then press Connect here.
      </li>
    </ol>
  );
}

/** Connected GitHub accounts: OAuth sign-in, sign-out, and what each account can do. */
export default function GitHubAccountsView({ panel }: ViewProps) {
  const [connecting, setConnecting] = useState<string | null>(null);
  // Poll while a sign-in is in flight so the card flips to "Connected" when GitHub calls back.
  const status = useGitHubStatus(connecting ? { refreshInterval: 2000 } : undefined);
  const { openConfirm, Dialog } = useConfirmDialog();
  const { busy, execute } = useBusyAction();
  const navigate = useNavigate();

  useEffect(() => {
    panel.setTitle("GitHub accounts");
  }, [panel]);

  useEffect(() => {
    if (!connecting) return;
    const account = status.data?.accounts.find(candidate => candidate.name === connecting);
    if (account?.isAuthenticated) {
      toastManager.success(`Connected ${connecting}${account.profile?.login ? ` as ${account.profile.login}` : ""}`, { duration: 4000 });
      setConnecting(null);
    }
  }, [connecting, status.data]);

  useEffect(() => {
    if (!connecting) return;
    const timer = setTimeout(() => {
      setConnecting(null);
      toastManager.warning("GitHub sign-in timed out. Try connecting again.", { duration: 5000 });
    }, CONNECT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [connecting]);

  const connect = useCallback(
    async (account: string) => {
      await execute(async () => {
        try {
          const { authorizationUrl, redirectUri } = await githubRPCClient.beginAuthorization({ account });
          setConnecting(account);
          const opened = window.open(authorizationUrl, "_blank", "noopener,noreferrer");
          if (!opened) {
            toastManager.info(`Open this URL to sign in: ${authorizationUrl}`, { duration: 15000 });
          }
          toastManager.info(`Waiting for GitHub to call back at ${redirectUri}`, { duration: 6000 });
        } catch (error) {
          toastManager.error(formatError(error), { duration: 6000 });
        }
      });
    },
    [execute],
  );

  const disconnect = useCallback(
    async (account: string) => {
      const ok = await openConfirm({
        id: "github:disconnect-account",
        title: "Disconnect GitHub account?",
        message: `This revokes the token TokenRing holds for "${account}". You can connect it again at any time.`,
        confirmText: "Disconnect",
        variant: "danger",
      });
      if (!ok) return;
      await execute(async () => {
        try {
          await githubRPCClient.revokeAuthorization({ account });
          toastManager.success(`Disconnected ${account}`, { duration: 3000 });
          void status.mutate();
        } catch (error) {
          toastManager.error(formatError(error), { duration: 6000 });
        }
      });
    },
    [execute, openConfirm, status.mutate],
  );

  let body: React.ReactNode;
  if (status.isLoading && !status.data) {
    body = <LoadingState message="Loading accounts…" className="h-full" />;
  } else if (status.error && !status.data) {
    body = <ErrorState title="Failed to load GitHub accounts" error={status.error} onRetry={() => void status.mutate()} variant="page" />;
  } else if (!status.data || status.data.accounts.length === 0) {
    body = (
      <EmptyState
        variant="page"
        className="h-full"
        icon={KeyRound}
        title="No GitHub accounts configured"
        hint="TokenRing needs a GitHub account to file issues, comment and review. Pick one way to add it:"
        ctaLabel="Open GitHub configuration"
        onCta={() => void navigate(GITHUB_CONFIG_HREF)}
      >
        <div className="max-w-md mx-auto mt-3 text-xs text-muted">
          <SetupSteps />
        </div>
      </EmptyState>
    );
  } else {
    body = (
      <div className="space-y-4">
        {!status.data.hasOAuthClient && (
          <div className="text-xs text-muted rounded-lg border border-dashed border-primary px-3 py-2 space-y-1">
            <p>Browser sign-in ("Connect") is not set up, so accounts need a personal access token.</p>
            <SetupSteps />
          </div>
        )}
        <ul className="space-y-3" aria-label="GitHub accounts">
          {status.data.accounts.map(account => (
            <AccountCard
              key={account.name}
              account={account}
              hasOAuthClient={status.data!.hasOAuthClient}
              connecting={connecting === account.name || busy}
              onConnect={() => void connect(account.name)}
              onDisconnect={() => void disconnect(account.name)}
            />
          ))}
        </ul>
        <p className="text-[11px] text-dim">
          The OAuth callback URL is served by this TokenRing instance; register it as an authorization callback URL on your GitHub OAuth app.
        </p>
      </div>
    );
  }

  return (
    <ViewShell
      pad="page"
      width="prose"
      header={
        <ViewHeader
          variant="panel"
          dashboardId={GITHUB_DASHBOARD_ID}
          title="GitHub accounts"
          subtitle="Who TokenRing acts as on GitHub"
          actions={[
            { key: "refresh", icon: <RefreshCw className="w-3.5 h-3.5" />, label: "Refresh accounts", title: "Refresh", onClick: () => void status.mutate() },
          ]}
        />
      }
    >
      {body}
      <Dialog />
    </ViewShell>
  );
}
