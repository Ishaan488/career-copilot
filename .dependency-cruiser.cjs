/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-module-internal-imports',
      comment: 'A module may only import from another module root index (public API), never deep-import internal files.',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/',
      },
      to: {
        path: '^src/modules/([^/]+)/.+',
        pathNot: [
          '^src/modules/$1/.+', // self module internal imports are allowed
          '^src/modules/[^/]+/index(\\.ts)?$', // public API index is allowed
        ],
      },
    },
    {
      name: 'no-circular-module-dependencies',
      comment: 'No circular dependencies allowed between modules.',
      severity: 'error',
      from: {
        path: '^src/modules/[^/]+',
      },
      to: {
        circular: true,
      },
    },
    {
      name: 'shared-must-not-depend-on-modules',
      comment: 'Shared code (L0) must not import any modules or db schemas.',
      severity: 'error',
      from: {
        path: '^src/shared',
      },
      to: {
        path: '^src/(modules|db|worker|app)',
      },
    },
    {
      name: 'policy-must-not-import-ai-or-discovery',
      comment: 'Policy engine must remain independent of AI and discovery.',
      severity: 'error',
      from: {
        path: '^src/modules/policy',
      },
      to: {
        path: '^src/modules/(ai|discovery|company-discovery)',
      },
    },
    {
      name: 'resume-manager-must-not-import-ai',
      comment: 'Resume manager is storage and selection only; no AI.',
      severity: 'error',
      from: {
        path: '^src/modules/resume',
      },
      to: {
        path: '^src/modules/(ai|intelligence)',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
  },
};
