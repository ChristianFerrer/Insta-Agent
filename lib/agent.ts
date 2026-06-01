import Anthropic from "@anthropic-ai/sdk";
import { env } from "./config";
import { SYSTEM_PROMPT } from "./prompts";
import { generateImage } from "./tools/image-gen";
import { generateCaption } from "./tools/caption";
import type { ConversationTurn, Proposal } from "./types";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "create_post_proposal",
    description:
      "Generates a full Instagram post proposal: image + caption + hashtags. " +
      "Call this when the user has provided enough info (subject and optionally an occasion). " +
      "If you need more info (e.g. whole band or one member, what occasion), " +
      "ask the user in plain text BEFORE calling this tool.",
    input_schema: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "Name of the musician or band, e.g. 'Freddie Mercury' or 'Black Sabbath'",
        },
        subject_description: {
          type: "string",
          description:
            "Detailed physical/visual description for the image generator. " +
            "Include iconic features (hair, clothing, instrument, pose).",
        },
        composition: {
          type: "string",
          description:
            "Composition hint: 'centered portrait', 'group of 4 figures', 'medium shot', etc.",
        },
        context: {
          type: "string",
          description:
            "Occasion for the caption: 'tribute - death anniversary', 'birthday celebration', " +
            "'album anniversary', 'general tribute'",
        },
      },
      required: ["subject", "subject_description", "composition", "context"],
    },
  },
];

export type AgentResult =
  | { kind: "message"; text: string; newHistory: ConversationTurn[] }
  | { kind: "proposal"; proposal: Proposal; newHistory: ConversationTurn[] };

export async function runAgent(
  userMessage: string,
  history: ConversationTurn[],
): Promise<AgentResult> {
  const messages: Anthropic.Messages.MessageParam[] = [
    ...(history.filter(
      (t) => t.role === "user" || t.role === "assistant",
    ) as Anthropic.Messages.MessageParam[]),
    { role: "user", content: userMessage },
  ];

  for (let iter = 0; iter < 5; iter++) {
    const response = await client().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      let proposal: Proposal | null = null;

      for (const block of toolUseBlocks) {
        if (block.type !== "tool_use") continue;
        if (block.name === "create_post_proposal") {
          const args = block.input as {
            subject: string;
            subject_description: string;
            composition?: string;
            context?: string;
          };

          const [img, cap] = await Promise.all([
            generateImage(args.subject_description, args.composition ?? "centered portrait"),
            generateCaption(args.subject, args.context ?? "general tribute"),
          ]);

          proposal = {
            subject: args.subject,
            image_url: img.url,
            image_prompt: img.prompt,
            caption: cap.caption,
            hashtags: cap.hashtags,
          };

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({
              status: "ok",
              subject: args.subject,
              note: "Proposal generated and shown to user for approval.",
            }),
          });
        }
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      if (proposal) {
        // Reset history after successful proposal
        return { kind: "proposal", proposal, newHistory: [] };
      }
      continue;
    }

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();

    const newHistory: ConversationTurn[] = [
      ...history,
      { role: "user", content: userMessage },
      { role: "assistant", content: text },
    ];

    return { kind: "message", text: text || "(sin respuesta)", newHistory };
  }

  return {
    kind: "message",
    text: "No pude completar la tarea, probá de nuevo.",
    newHistory: history,
  };
}
