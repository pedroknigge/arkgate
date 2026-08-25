/**
 * HS post-write skill catalog: adapters, home skip/prune, Claude/Grok home skip.
 * Kept out of install-migrate so that file stays inside its module budget.
 */
import fs from 'node:fs';
import path from 'node:path';
import { arkCommand } from '../ark-shared.mjs';
import { installRequestedAgentHomes } from './agent-homes.mjs';
import { codexSkillsDir } from './codex-home.mjs';
import {
  canonicalSkillPath,
  linkSkillHostAdapters,
  pruneHomeArkSkillDuplicates,
  skillTemplateNames,
} from './skill-install.mjs';
import { installSkillCatalog, skillInstallLine } from './skill-write.mjs';

function skillName(skill) {
  return Array.isArray(skill) ? skill[0] : skill?.name || skill;
}

export function projectCatalogReady(root, skillNames) {
  return skillNames.some((name) => fs.existsSync(path.join(root, canonicalSkillPath(name))));
}

export function applySkillCatalogFollowup({
  root,
  tools,
  skills,
  version,
  args,
}) {
  const skillNames = skills.map(skillName);
  if (!args.compact && skillNames.length > 0) {
    const adapterResults = linkSkillHostAdapters(root, tools, skillNames, Boolean(args.force));
    for (const row of adapterResults) {
      if (row.status === 'linked' || row.status === 'copied') {
        console.log(
          `  ${row.status.padEnd(7)} ${row.relativePath}  (adapter → .agents/skills/${row.name})`
        );
      }
    }
  }
  if (args.pruneHomeDuplicates) {
    const pruned = pruneHomeArkSkillDuplicates(
      root,
      skillNames.length ? skillNames : skillTemplateNames()
    );
    if (!pruned.ok) {
      console.log('  skip    --prune-home-duplicates (no project .agents/skills catalog yet)');
    } else if (pruned.removed.length === 0) {
      console.log('  skip    --prune-home-duplicates (no home ark-* copies)');
    } else {
      console.log(`  pruned  ${pruned.removed.length} home ark-* path(s) (project catalog is enough)`);
    }
  }

  const homeResults = [];
  if (args.codexHome) {
    const dir = codexSkillsDir();
    console.log('');
    console.log(
      `Codex home skills (scope=home-shared; source=${version ? `arkgate@${version}` : 'arkgate@unknown'}; target=${dir}/<name>/SKILL.md):`
    );
    console.log(
      '  Compatibility: monotonic downgrade protection requires every shared-catalog writer ' +
        'to use ArkGate 4.2.0+; pre-4.2 --codex-home ignores this catalog. Upgrade legacy repos first.'
    );
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.error(`  FAILED to create ${dir} (${error.message})`);
      homeResults.push({ relativePath: dir, status: 'failed' });
    }
    if (homeResults.length === 0) {
      const hasCatalog = skills.some((skill) =>
        fs.existsSync(path.join(root, '.agents', 'skills', skillName(skill), 'SKILL.md'))
      );
      if (hasCatalog) {
        console.log(
          '  Skip home write — project .agents/skills is the catalog. Codex lists user+repo; a home copy duplicates every /ark-*.'
        );
        console.log(
          `  Remove leftover home copies: ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --prune-home-duplicates')}`
        );
      } else {
        for (const result of installSkillCatalog({
          directory: dir,
          skills,
          packageVersion: version,
          force: args.force,
          scope: 'home',
        })) {
          console.log(skillInstallLine(result));
          homeResults.push(result);
        }
      }
    }
  }

  const catalogReady = projectCatalogReady(root, skillNames);
  if ((args.claudeHome || args.grokHome || args.agentHomes) && catalogReady) {
    if (!args.json) {
      console.log('');
      console.log(
        'Skip Claude/Grok home skill write — project .agents/skills + adapters are the catalog. Home ark-* copies override or duplicate.'
      );
      console.log(
        `  Remove leftover home copies: ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --prune-home-duplicates')}`
      );
    }
  } else {
    installRequestedAgentHomes({
      root,
      skills,
      version,
      force: args.force,
      claudeHome: args.claudeHome,
      grokHome: args.grokHome,
      agentHomes: args.agentHomes,
      json: args.json,
    });
  }

  return { skillNames, homeResults };
}
