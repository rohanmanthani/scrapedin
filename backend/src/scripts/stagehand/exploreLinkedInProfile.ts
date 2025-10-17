import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "stagehand/lib/adapters/child-process.js";
import { disconnect } from "stagehand";
import type {
  LinkedInProfileStagehandService,
  LinkedInStagehandAnalysis,
  StagehandFieldMatch,
  StagehandExperienceInsight
} from "../../linkedin/stagehand/LinkedInProfileStagehandAnalyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PROFILE_PATH = resolve(__dirname, "../../../../debug-profile.html");

type CliOptions = {
  inputPath: string;
  outputJson: boolean;
};

const isUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const parseArgs = (argv: string[]): CliOptions => {
  const args = argv.slice(2);
  let outputJson = false;
  const filteredArgs: string[] = [];

  for (const arg of args) {
    if (arg === "--json") {
      outputJson = true;
      continue;
    }
    filteredArgs.push(arg);
  }

  const inputPath = filteredArgs[0] ?? DEFAULT_PROFILE_PATH;

  return { inputPath, outputJson };
};

const readInput = async (inputPath: string): Promise<string> => {
  if (isUrl(inputPath)) {
    const response = await fetch(inputPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${inputPath}: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  }
  const absolutePath = resolve(process.cwd(), inputPath);
  return await readFile(absolutePath, "utf-8");
};

const formatField = (field: StagehandFieldMatch): string => {
  const value = field.value ?? "<missing>";
  const selector = field.matchedSelector ?? "<no selector>";
  const confidence = field.confidence.toFixed(2);
  return `${field.field}: ${value} (selector: ${selector}, confidence: ${confidence})`;
};

const formatExperience = (experience: StagehandExperienceInsight): string => {
  const pieces = [
    `#${experience.index}${experience.isCurrent ? " (current)" : ""}`,
    experience.fields.title.value ?? "<no title>",
    experience.fields.company.value ?? "<no company>",
    experience.fields.dateRange.value ?? "<no date range>"
  ];
  return pieces.join(" | ");
};

const printSummary = (analysis: LinkedInStagehandAnalysis): void => {
  console.log("\nDetected fields:");
  analysis.fields.forEach((field) => {
    console.log(`  • ${formatField(field)}`);
  });

  console.log("\nExperience snapshot:");
  analysis.experiences.slice(0, 5).forEach((experience) => {
    console.log(`  • ${formatExperience(experience)}`);
  });

  console.log("\nMetadata:");
  console.log(`  • Document title: ${analysis.documentTitle ?? "<unknown>"}`);
  console.log(`  • HTML length: ${analysis.metadata.htmlLength}`);
  console.log(`  • Generated at: ${analysis.metadata.generatedAt}`);
  if (analysis.metadata.warnings.length > 0) {
    console.log("  • Warnings:");
    analysis.metadata.warnings.forEach((warning) => {
      console.log(`    - ${warning}`);
    });
  }
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv);
  const html = await readInput(options.inputPath);

  const workerJsPath = resolve(__dirname, "../../linkedin/stagehand/profileWorker.js");
  const workerTsPath = resolve(__dirname, "../../linkedin/stagehand/profileWorker.ts");
  const workerEntry = existsSync(workerJsPath)
    ? { path: workerJsPath, execArgv: [] as string[] }
    : { path: workerTsPath, execArgv: ["--import", "tsx"] };
  const child = fork(workerEntry.path, [], { stdio: "inherit", execArgv: workerEntry.execArgv });

  try {
    const remote = await connect<LinkedInProfileStagehandService>(child);
    const analysis = await remote.analyzeHtml(html);

    if (options.outputJson) {
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      printSummary(analysis);
    }

    disconnect(remote);
  } finally {
    child.kill();
  }
};

main().catch((error) => {
  console.error("Stagehand exploration failed:", error);
  process.exitCode = 1;
});
