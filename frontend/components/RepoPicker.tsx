import InlineDropdown, { InlineDropdownItem, useInlineDropdown } from "@tokenring-ai/one-frontend/components/ui/InlineDropdown.tsx";
import { cn } from "@tokenring-ai/one-frontend/lib/utils.ts";
import { useGitHubRepositorySearch } from "@tokenring-ai/one-frontend/rpc.ts";
import { Book, ChevronDown, FolderGit2, History, Loader2, Search, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { parseRepoSlug, repoSlug } from "../lib/paths.ts";

export interface RepoPickerProps {
  /** The repository in use, or null when none is selected and the workspace has no remote. */
  current: { owner: string; repo: string } | null;
  fromWorkspace: boolean;
  workspaceRepo: { owner: string; repo: string } | null;
  recent: string[];
  account?: string | undefined;
  loading?: boolean | undefined;
  onSelect: (owner: string, repo: string) => void;
}

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

function PickerBody({ current, fromWorkspace, workspaceRepo, recent, account, onSelect }: Omit<RepoPickerProps, "loading">) {
  const { close } = useInlineDropdown();
  const [query, setQuery] = useState("");
  const typed = parseRepoSlug(query);
  // A full slug is opened directly; anything else searches GitHub once typing pauses.
  const searchTerm = useDebounced(typed ? "" : query, 350);
  const search = useGitHubRepositorySearch(searchTerm, account);
  const currentSlug = current ? repoSlug(current.owner, current.repo) : null;

  const pick = (owner: string, repo: string) => {
    onSelect(owner, repo);
    close();
  };

  return (
    <div className="flex flex-col max-h-96">
      <div className="px-2 py-2 border-b border-primary">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && typed) {
                event.preventDefault();
                pick(typed.owner, typed.repo);
              }
            }}
            placeholder="owner/repo or search…"
            aria-label="Repository slug or search"
            className="w-full bg-input border border-primary rounded-lg pl-8 pr-2 py-1.5 text-xs text-primary placeholder-muted focus-accent"
          />
        </div>
      </div>
      <nav className="py-1 overflow-y-auto min-h-0">
        {typed && (
          <InlineDropdownItem
            onClick={() => pick(typed.owner, typed.repo)}
            leading={<FolderGit2 className="w-4 h-4 text-muted shrink-0" />}
            className="gap-2.5"
          >
            Open {typed.owner}/{typed.repo}
          </InlineDropdownItem>
        )}
        {workspaceRepo && !query && (
          <InlineDropdownItem
            active={fromWorkspace}
            onClick={() => pick(workspaceRepo.owner, workspaceRepo.repo)}
            leading={<FolderGit2 className="w-4 h-4 text-accent shrink-0" />}
            trailing={<span className="text-[10px] uppercase tracking-wider text-dim">workspace</span>}
            className="gap-2.5"
          >
            {repoSlug(workspaceRepo.owner, workspaceRepo.repo)}
          </InlineDropdownItem>
        )}
        {!query &&
          recent
            .filter(slug => !workspaceRepo || slug !== repoSlug(workspaceRepo.owner, workspaceRepo.repo))
            .map(slug => {
              const parsed = parseRepoSlug(slug);
              if (!parsed) return null;
              return (
                <InlineDropdownItem
                  key={slug}
                  active={!fromWorkspace && slug === currentSlug}
                  onClick={() => pick(parsed.owner, parsed.repo)}
                  leading={<History className="w-4 h-4 text-muted shrink-0" />}
                  className="gap-2.5"
                >
                  {slug}
                </InlineDropdownItem>
              );
            })}
        {searchTerm && search.isLoading && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching GitHub…
          </div>
        )}
        {searchTerm && search.error ? <p className="px-3 py-2 text-xs text-red-500">Search failed. Type owner/repo to open it directly.</p> : null}
        {searchTerm &&
          search.data?.repositories.map(repository => {
            const parsed = parseRepoSlug(repository.full_name);
            if (!parsed) return null;
            return (
              <InlineDropdownItem
                key={repository.full_name}
                onClick={() => pick(parsed.owner, parsed.repo)}
                leading={<Book className="w-4 h-4 text-muted shrink-0" />}
                trailing={
                  <span className="flex items-center gap-1 text-[10px] text-dim">
                    <Star className="w-3 h-3" /> {repository.stargazers_count}
                  </span>
                }
                className="gap-2.5"
              >
                <span className="block truncate">{repository.full_name}</span>
                {repository.description && <span className="block text-[11px] text-muted truncate">{repository.description}</span>}
              </InlineDropdownItem>
            );
          })}
        {!query && !workspaceRepo && recent.length === 0 && <p className="px-3 py-3 text-xs text-muted">Type an owner/repo slug or search to get started.</p>}
      </nav>
    </div>
  );
}

/** Which repository the dashboard works against. */
export default function RepoPicker(props: RepoPickerProps) {
  const { current, loading } = props;
  return (
    <InlineDropdown
      header="Repository"
      width="w-80"
      align="left"
      triggerClassName="gap-1.5 bg-transparent border-transparent hover:bg-hover text-primary max-w-full"
      aria-label="Select repository"
      trigger={open => (
        <>
          {loading ? <Loader2 className="w-3.5 h-3.5 shrink-0 text-muted animate-spin" /> : <FolderGit2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
          <span className="text-xs font-semibold text-primary truncate">{current ? repoSlug(current.owner, current.repo) : "Select repository"}</span>
          <ChevronDown className={cn("w-3 h-3 text-muted transition-transform shrink-0", open && "rotate-180")} />
        </>
      )}
    >
      <PickerBody {...props} />
    </InlineDropdown>
  );
}
