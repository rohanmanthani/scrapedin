import OpenAI from "openai";
import { icpSchema } from "../schemas.js";
import type { ICPProfile, LeadRecord } from "../types.js";

const JSON_BLOCK_REGEX = /```json([\s\S]*?)```/i;

const extractJson = (text: string): unknown => {
  const match = text.match(JSON_BLOCK_REGEX);
  const payload = match ? match[1] : text;
  try {
    return JSON.parse(payload.trim());
  } catch (error) {
    throw new Error("Failed to parse JSON from OpenAI response");
  }
};

export class AiService {
  private readonly client: OpenAI;

  constructor(private readonly apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey: this.apiKey });
  }

  async generateICP(instructions: string, seed?: ICPProfile): Promise<ICPProfile> {
    const context = seed ? `Existing ICP (JSON):\n${JSON.stringify(seed, null, 2)}` : "No existing ICP provided.";
    const response = await this.client.responses.create({
      model: this.model,
      instructions:
        "You are a revenue operations assistant. Produce structured JSON for an Ideal Customer Profile used with LinkedIn Sales Navigator. Always respond with valid JSON matching the schema keys.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Instructions:\n${instructions}\n\n${context}\n\nRespond with JSON only.`
            }
          ]
        }
      ]
    });

    const output = response.output_text?.trim();
    if (!output) {
      throw new Error("OpenAI returned an empty response while generating the ICP");
    }
    const parsed = extractJson(output);
    return icpSchema.parse(parsed);
  }

  async inferCompanyDetails(lead: LeadRecord): Promise<{
    companyName?: string;
    companyDomain?: string;
    reasoning?: string;
  }> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions:
        "You infer company details from sparse Sales Navigator leads. Return JSON with companyName (string|undefined), companyDomain (string|undefined), and reasoning (string). Domain must be a bare domain like example.com.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Lead data (JSON):\n${JSON.stringify(
                {
                  fullName: lead.fullName,
                  headline: lead.headline,
                  title: lead.title,
                  companyName: lead.companyName ?? lead.inferredCompanyName,
                  companyUrl: lead.companyUrl,
                  location: lead.location,
                  raw: lead.raw
                },
                null,
                2
              )}\n\nReturn JSON only.`
            }
          ]
        }
      ]
    });

    const output = response.output_text?.trim();
    if (!output) {
      return {
        companyName: lead.companyName ?? lead.inferredCompanyName,
        companyDomain: lead.inferredCompanyDomain,
        reasoning: "OpenAI returned no data"
      };
    }
    const parsed = extractJson(output) as {
      companyName?: string;
      companyDomain?: string;
      reasoning?: string;
    };

    return {
      companyName: parsed.companyName?.trim() || undefined,
      companyDomain: parsed.companyDomain?.trim().toLowerCase() || undefined,
      reasoning: parsed.reasoning
    };
  }
}
