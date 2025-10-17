import { launch } from "stagehand/lib/adapters/child-process.js";
import {
  LinkedInProfileStagehandAnalyzer,
  LinkedInProfileStagehandService
} from "./LinkedInProfileStagehandAnalyzer.js";

const analyzer = new LinkedInProfileStagehandAnalyzer();
const service: LinkedInProfileStagehandService = {
  analyzeHtml: (html) => analyzer.analyzeHtml(html)
};

process.on("disconnect", () => {
  process.exit(0);
});

void launch(service);
