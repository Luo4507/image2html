import { z } from 'zod';
import { getDefaultCodegenOptions } from '../config.js';
import { assertValidCodegenOptions } from '../runtime/codegen-options.js';

export const jobOptionSchema = z.object({
  framework: z.enum(['react', 'vue', 'html']).optional(),
  styleFramework: z.enum(['tailwind', 'scss', 'css-modules', 'inline']).optional(),
  componentLibrary: z.enum(['antd', 'element', 'none']).optional(),
  typescript: z.boolean().optional(),
  responsive: z.boolean().optional(),
  accessibility: z.boolean().optional(),
  pipeline: z.enum(['direct', 'structured']).optional(),
  qualityMode: z.enum(['fast', 'balanced', 'precision']).optional(),
  layoutMode: z.enum(['single', 'segmented', 'auto']).optional(),
  assetMode: z.enum(['none', 'extract']).optional(),
});

export function resolveJobOptions(input: unknown) {
  const parsed = jobOptionSchema.parse(input);
  const options = { ...getDefaultCodegenOptions(), ...parsed };
  if (parsed.componentLibrary === undefined) {
    if (options.framework === 'html') options.componentLibrary = 'none';
    if (options.framework === 'vue') options.componentLibrary = 'element';
  }
  assertValidCodegenOptions(options);
  return options;
}
