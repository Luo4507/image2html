export interface CorrectionScore {
  similarity: number;
  passed: boolean;
}

export interface CorrectionHistoryEntry<T extends CorrectionScore> {
  iteration: number;
  validation: T;
  score: number;
  adopted: boolean;
  improved: boolean;
}

export interface AutoCorrectionOptions<T extends CorrectionScore> {
  initialCode: string;
  initialValidation: T;
  maxIterations: number;
  minImprovement?: number;
  score?: (validation: T) => number;
  repair: (code: string, validation: T) => Promise<string>;
  validate: (code: string) => Promise<T>;
}

/** Repair only while the measured visual score keeps improving. */
export async function runAutoCorrection<T extends CorrectionScore>(
  options: AutoCorrectionOptions<T>
): Promise<{
  code: string;
  validation: T;
  iterations: number;
  history: Array<CorrectionHistoryEntry<T>>;
}> {
  let bestCode = options.initialCode;
  let bestValidation = options.initialValidation;
  let iterations = 0;
  const minImprovement = options.minImprovement ?? 0.1;
  const score = options.score || ((validation: T) => validation.similarity);
  const history: Array<CorrectionHistoryEntry<T>> = [{
    iteration: 0,
    validation: bestValidation,
    score: score(bestValidation),
    adopted: true,
    improved: true,
  }];

  while (iterations < options.maxIterations && !bestValidation.passed) {
    const candidateCode = await options.repair(bestCode, bestValidation);
    const candidateValidation = await options.validate(candidateCode);
    iterations += 1;
    const improved = score(candidateValidation) >= score(bestValidation) + minImprovement;
    history.push({
      iteration: iterations,
      validation: candidateValidation,
      score: score(candidateValidation),
      adopted: improved,
      improved,
    });

    if (!improved) {
      return { code: bestCode, validation: bestValidation, iterations, history };
    }

    bestCode = candidateCode;
    bestValidation = candidateValidation;
  }

  return {
    code: bestCode,
    validation: bestValidation,
    iterations,
    history,
  };
}
