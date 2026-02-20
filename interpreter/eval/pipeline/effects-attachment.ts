import type { PipelineCommand, PipelineStage, PipelineStageEntry } from '@core/types';
import { isBuiltinEffect } from './builtin-effects';

/**
 * Attach builtin effects (e.g., @log, @show, @output) to preceding functional stages.
 * - Effects after a parallel group attach to each command in the group.
 * - Leading effects attach to the first functional stage encountered.
 * - If the pipeline contains only effects, synthesize an __identity__ stage to host them.
 */
export function attachBuiltinEffects(pipeline: PipelineStage[]): {
  functionalPipeline: PipelineStage[];
  hadLeadingEffects: boolean;
} {
  const functional: PipelineStage[] = [];
  const pendingLeadingEffects: PipelineCommand[] = [];
  let hadLeadingEffects = false;

  for (const stage of pipeline) {
    if (Array.isArray(stage)) {
      const { functionalPipeline: group, hadLeadingEffects: inner } = attachBuiltinEffects(stage);
      if (pendingLeadingEffects.length > 0 && group.length > 0) {
        for (const cmd of group as PipelineStageEntry[]) {
          if ((cmd as PipelineCommand).rawIdentifier) {
            const command = cmd as PipelineCommand;
            command.effects = [
              ...(command.effects || []),
              ...pendingLeadingEffects
            ];
          }
        }
        pendingLeadingEffects.length = 0;
      }
      if (group.length > 0) {
        functional.push(group as PipelineStage);
      }
      hadLeadingEffects = hadLeadingEffects || inner;
      continue;
    }

    const name = stage.rawIdentifier;
    const lowerName = typeof name === 'string' ? name.toLowerCase() : '';
    const requiresMeta = lowerName === 'append';
    const isInlineEffect = isBuiltinEffect(name) && (
      (stage as PipelineCommand).meta?.isBuiltinEffect || !requiresMeta
    );
    if (isInlineEffect) {
      if (functional.length > 0) {
        const prev = functional[functional.length - 1];
        if (Array.isArray(prev)) {
          for (const pcmd of prev as PipelineStageEntry[]) {
            if ((pcmd as PipelineCommand).rawIdentifier) {
              const command = pcmd as PipelineCommand;
              command.effects = [
                ...(command.effects || []),
                stage
              ];
            }
          }
        } else {
          const prevCmd = prev as PipelineStageEntry;
          if ((prevCmd as PipelineCommand).rawIdentifier) {
            (prevCmd as PipelineCommand).effects = [
              ...(((prevCmd as PipelineCommand).effects) || []),
              stage
            ];
          }
        }
      } else {
        pendingLeadingEffects.push(stage);
        hadLeadingEffects = true;
      }
      continue;
    }

    const cmd: PipelineStageEntry = { ...(stage as any) };
    // Attach pending leading effects as pre-effects (run before stage, not after)
    if (pendingLeadingEffects.length > 0) {
      (cmd as any).preEffects = [...((cmd as any).preEffects || []), ...pendingLeadingEffects];
      pendingLeadingEffects.length = 0;
    }
    functional.push(cmd as PipelineStage);
  }

  if (functional.length === 0 && pendingLeadingEffects.length > 0) {
    functional.push({
      rawIdentifier: '__identity__',
      identifier: [],
      args: [],
      fields: [],
      rawArgs: [],
      effects: [...pendingLeadingEffects]
    } as PipelineCommand);
    pendingLeadingEffects.length = 0;
  }

  return { functionalPipeline: functional, hadLeadingEffects };
}
