// The scan as JSON: what `scan --json` prints, and what the web view's /api/scan builds on, so the
// two shapes cannot drift.
import { skillLink } from './model.ts';
import type { OrganizationScanResult, ScanResult } from './scan.ts';

/** A repository's scan: each skill with its whole description and link; not its content, the link has it. */
export function scanJson(source: string, { repository, skills, warnings }: ScanResult) {
  return {
    source,
    repository: { id: repository.id, url: repository.url, commit: repository.commit },
    skills: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      path: skill.path,
      link: skillLink(repository, skill),
      copies: skill.copies,
    })),
    warnings,
  };
}

/** An organization's scan: every repository, with its number of skills. */
export function organizationScanJson(source: string, { organization, repositories, warnings }: OrganizationScanResult) {
  return { source, organization, repositories, warnings };
}
