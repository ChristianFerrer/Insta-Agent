import { z } from "zod";

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(8),
  TELEGRAM_ALLOWED_USER_IDS: z.string().default(""),

  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),

  FAL_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().default("bandtoons"),

  IG_ACCESS_TOKEN: z.string().default(""),
  IG_BUSINESS_ACCOUNT_ID: z.string().default(""),

  CRON_SECRET: z.string().default(""),
});

type Env = z.infer<typeof schema>;

let cached: Env | null = null;

function loadEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration. See logs above.");
  }
  cached = parsed.data;
  return cached;
}

// Lazy proxy: env vars are only validated on first property access at request time,
// not at module load. This lets Next.js collect page metadata at build time without
// requiring all secrets to be present.
export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return loadEnv()[prop as keyof Env];
  },
});

export function allowedUserIdsSet(): Set<number> {
  return new Set(
    env.TELEGRAM_ALLOWED_USER_IDS.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s)),
  );
}

// Backwards-compat alias used by existing imports
export const allowedUserIds = {
  get size(): number {
    return allowedUserIdsSet().size;
  },
  has(id: number): boolean {
    return allowedUserIdsSet().has(id);
  },
  [Symbol.iterator](): IterableIterator<number> {
    return allowedUserIdsSet()[Symbol.iterator]();
  },
};

export const STYLE_PROMPT_BASE =
  "1930s rubber hose cartoon style, vintage Fleischer/Disney animation aesthetic, " +
  "thick bold black outlines, simple flat shapes, expressive cartoon eyes, " +
  "muted sepia and warm earth tones color palette, grainy film texture, " +
  "minimalist solid color background, hand-drawn vintage poster look, " +
  "high contrast, slightly rough linework, retro illustration";

export const IMAGE_SIZE = "square_hd" as const;
