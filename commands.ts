import connectGitHub from "./commands/connect/github.ts";
import accountAuth from "./commands/github/account/auth.ts";
import accountGet from "./commands/github/account/get.ts";
import accountList from "./commands/github/account/list.ts";
import accountLogout from "./commands/github/account/logout.ts";
import docs from "./commands/github/docs.ts";
import file from "./commands/github/file.ts";
import issueComment from "./commands/github/issue/comment.ts";
import issueCreate from "./commands/github/issue/create.ts";
import issue from "./commands/github/issue.ts";
import issuesSearch from "./commands/github/issues/search.ts";
import issues from "./commands/github/issues.ts";
import labels from "./commands/github/labels.ts";
import prComment from "./commands/github/pr/comment.ts";
import prCreate from "./commands/github/pr/create.ts";
import prDiff from "./commands/github/pr/diff.ts";
import prFiles from "./commands/github/pr/files.ts";
import prReview from "./commands/github/pr/review.ts";
import prStatus from "./commands/github/pr/status.ts";
import pr from "./commands/github/pr.ts";
import prsSearch from "./commands/github/prs/search.ts";
import prs from "./commands/github/prs.ts";
import search from "./commands/github/search.ts";

export default [
  connectGitHub,
  accountList,
  accountGet,
  accountAuth,
  accountLogout,
  search,
  docs,
  file,
  issues,
  issuesSearch,
  issue,
  issueCreate,
  issueComment,
  labels,
  prs,
  prsSearch,
  pr,
  prCreate,
  prDiff,
  prFiles,
  prStatus,
  prReview,
  prComment,
];
