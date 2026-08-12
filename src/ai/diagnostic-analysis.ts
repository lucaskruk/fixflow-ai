import {
  diagnosticAnalysisEventContentSchema,
  diagnosticAnalysisSchema,
  type DiagnosticAnalysis,
} from "../domain/schemas";

export function serializeDiagnosticAnalysis(
  analysis: DiagnosticAnalysis,
): string {
  const validAnalysis = diagnosticAnalysisSchema.parse(analysis);
  return JSON.stringify({
    version: 1,
    kind: "DIAGNOSTIC_ANALYSIS",
    analysis: validAnalysis,
  });
}

export function parseDiagnosticAnalysisEvent(
  content: string,
): DiagnosticAnalysis | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  const result = diagnosticAnalysisEventContentSchema.safeParse(parsed);
  return result.success ? result.data.analysis : null;
}
