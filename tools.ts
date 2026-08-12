import addLabels from "./tools/addLabels.ts";
import addPRReviewers from "./tools/addPRReviewers.ts";
import closePR from "./tools/closePR.ts";
import commentIssue from "./tools/commentIssue.ts";
import commentPR from "./tools/commentPR.ts";
import createIssue from "./tools/createIssue.ts";
import createPR from "./tools/createPR.ts";
import getIssue from "./tools/getIssue.ts";
import getPR from "./tools/getPR.ts";
import getPRDiff from "./tools/getPRDiff.ts";
import getPRFiles from "./tools/getPRFiles.ts";
import getPRStatus from "./tools/getPRStatus.ts";
import getRepoDocumentation from "./tools/getRepoDocumentation.ts";
import getRepoFile from "./tools/getRepoFile.ts";
import listIssues from "./tools/listIssues.ts";
import listLabels from "./tools/listLabels.ts";
import listPRComments from "./tools/listPRComments.ts";
import listPRReviews from "./tools/listPRReviews.ts";
import listPRs from "./tools/listPRs.ts";
import removeLabel from "./tools/removeLabel.ts";
import reviewPR from "./tools/reviewPR.ts";
import searchIssues from "./tools/searchIssues.ts";
import searchPRs from "./tools/searchPRs.ts";
import searchRepositories from "./tools/searchRepositories.ts";
import updateIssue from "./tools/updateIssue.ts";
import updatePR from "./tools/updatePR.ts";

export default [
  searchRepositories,
  getRepoDocumentation,
  getRepoFile,
  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  commentIssue,
  searchIssues,
  listLabels,
  addLabels,
  removeLabel,
  listPRs,
  getPR,
  searchPRs,
  getPRDiff,
  getPRFiles,
  getPRStatus,
  listPRReviews,
  listPRComments,
  createPR,
  updatePR,
  closePR,
  reviewPR,
  commentPR,
  addPRReviewers,
];
