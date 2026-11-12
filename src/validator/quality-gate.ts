import type { ValidationConfig, VisualQualityMetrics } from '../types.js';

type GateConfig = Pick<
  ValidationConfig,
  'threshold' | 'minContentSimilarity' | 'minEdgeSimilarity'
> & {
  checkTextCoverage?: boolean;
  minTextCoverage?: number;
};

/** Require overall, foreground, and edge quality to pass independently. */
export function passesQualityGate(
  quality: VisualQualityMetrics,
  config: GateConfig
): boolean {
  const visualPassed =
    quality.overallSimilarity >= config.threshold &&
    quality.contentSimilarity >= config.minContentSimilarity &&
    quality.edgeSimilarity >= config.minEdgeSimilarity;
  const textPassed = !config.checkTextCoverage ||
    (quality.textCoverage ?? 0) >= (config.minTextCoverage ?? 80);
  return visualPassed && textPassed;
}
