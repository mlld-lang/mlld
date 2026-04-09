import type { ToolReturnMode } from '@core/types/executable';
import {
  analyzeReturnChannels as analyzeReturnChannelsShared,
  toToolReturnMode
} from '@core/validation/return-channels';

export function analyzeReturnChannels(root: unknown): ToolReturnMode {
  return toToolReturnMode(analyzeReturnChannelsShared(root));
}
