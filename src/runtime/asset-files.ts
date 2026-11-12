import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { GeneratedAsset } from '../types.js';

/** Normalize model-independent filenames and prevent output-directory traversal. */
export function normalizeGeneratedAssets(assets: GeneratedAsset[] = []): GeneratedAsset[] {
  const used = new Set<string>();
  return assets.map((asset, index) => {
    const base = basename(asset.name)
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/^\.+/, '');
    const fallback = `asset-${index + 1}.png`;
    const candidate = (base || fallback).slice(0, 120);
    const extensionIndex = candidate.lastIndexOf('.');
    const stem = extensionIndex > 0 ? candidate.slice(0, extensionIndex) : candidate;
    const extension = extensionIndex > 0 ? candidate.slice(extensionIndex) : '';
    let name = candidate;
    let suffix = 1;
    while (used.has(name)) {
      name = `${stem}-${suffix}${extension}`;
      suffix += 1;
    }
    used.add(name);
    return { ...asset, name };
  });
}

export async function writeGeneratedAssets(
  assets: GeneratedAsset[] = [],
  outputDir: string,
): Promise<void> {
  const normalized = normalizeGeneratedAssets(assets);
  if (normalized.length === 0) return;
  await mkdir(outputDir, { recursive: true });
  await Promise.all(normalized.map((asset) =>
    writeFile(join(outputDir, asset.name), Buffer.from(asset.data, 'base64'))
  ));
}
