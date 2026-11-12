import type { PageStructure } from './types.js';

function extractJson(content: string): string {
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('Vision model response does not contain a JSON object');
  }
  return unfenced.slice(start, end + 1);
}

/** Parse vision output, with an optional model-assisted repair pass. */
export async function parsePageStructure(
  content: string,
  repair?: (invalidContent: string) => Promise<string>
): Promise<PageStructure> {
  try {
    return JSON.parse(extractJson(content)) as PageStructure;
  } catch (error) {
    if (!repair) throw error;

    console.error('[design-to-code] Invalid structure JSON; attempting model repair');
    const repaired = await repair(content);
    try {
      return JSON.parse(extractJson(repaired)) as PageStructure;
    } catch {
      throw new Error('Unable to parse or repair the design structure JSON');
    }
  }
}
