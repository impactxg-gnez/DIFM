import { DIFM_VERSION, type DIFMInput, type DIFMResponse } from './types';

export interface DIFMLogRecord {
  calculation_id: string;
  input: DIFMInput;
  output: DIFMResponse;
  timestamp: string;
  version: typeof DIFM_VERSION;
}

export function buildDIFMLogRecord(input: DIFMInput, output: DIFMResponse): DIFMLogRecord {
  return {
    calculation_id: output.calculation_id,
    input,
    output,
    timestamp: new Date().toISOString(),
    version: DIFM_VERSION,
  };
}

export function logDIFMCalculation(record: DIFMLogRecord): void {
  console.log('[DIFM_CALCULATION]', record);
}

