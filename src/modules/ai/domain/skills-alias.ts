/**
 * Standard alias dictionary for technical skills and engineering disciplines.
 * Maps colloquial, misspelled, or variant tech skill names to canonical lowercase tokens.
 */
export const SKILL_ALIASES: Record<string, string> = {
  // Languages
  'ts': 'typescript',
  'typescript': 'typescript',
  'js': 'javascript',
  'javascript': 'javascript',
  'py': 'python',
  'python': 'python',
  'python3': 'python',
  'golang': 'go',
  'go': 'go',
  'rust': 'rust',
  'c++': 'cpp',
  'cpp': 'cpp',
  'c#': 'csharp',
  'csharp': 'csharp',
  'dotnet': '.net',
  '.net': '.net',
  'java': 'java',
  'ruby': 'ruby',
  'php': 'php',
  'kotlin': 'kotlin',
  'swift': 'swift',

  // Frontend
  'react': 'react',
  'react.js': 'react',
  'reactjs': 'react',
  'react native': 'react-native',
  'react-native': 'react-native',
  'next.js': 'nextjs',
  'nextjs': 'nextjs',
  'next': 'nextjs',
  'vue': 'vue',
  'vue.js': 'vue',
  'vuejs': 'vue',
  'nuxt': 'nuxtjs',
  'nuxtjs': 'nuxtjs',
  'angular': 'angular',
  'angularjs': 'angular',
  'svelte': 'svelte',
  'sveltekit': 'sveltekit',
  'tailwind': 'tailwindcss',
  'tailwindcss': 'tailwindcss',
  'css': 'css',
  'css3': 'css',
  'html': 'html',
  'html5': 'html',
  'redux': 'redux',
  'zustand': 'zustand',
  'graphql': 'graphql',

  // Backend & Runtime
  'node': 'nodejs',
  'node.js': 'nodejs',
  'nodejs': 'nodejs',
  'express': 'express',
  'express.js': 'express',
  'fastify': 'fastify',
  'nest': 'nestjs',
  'nestjs': 'nestjs',
  'django': 'django',
  'fastapi': 'fastapi',
  'flask': 'flask',
  'spring': 'spring-boot',
  'spring boot': 'spring-boot',
  'springboot': 'spring-boot',
  'rails': 'ruby-on-rails',
  'ruby on rails': 'ruby-on-rails',

  // Databases & Storage
  'postgres': 'postgresql',
  'postgresql': 'postgresql',
  'psql': 'postgresql',
  'mysql': 'mysql',
  'mongodb': 'mongodb',
  'mongo': 'mongodb',
  'redis': 'redis',
  'elasticsearch': 'elasticsearch',
  'elastic': 'elasticsearch',
  'dynamodb': 'dynamodb',
  'cassandra': 'cassandra',
  'sqlite': 'sqlite',
  'neo4j': 'neo4j',
  'kafka': 'kafka',
  'apache kafka': 'kafka',
  'rabbitmq': 'rabbitmq',

  // Cloud & DevOps
  'aws': 'aws',
  'amazon web services': 'aws',
  'gcp': 'gcp',
  'google cloud': 'gcp',
  'google cloud platform': 'gcp',
  'azure': 'azure',
  'microsoft azure': 'azure',
  'docker': 'docker',
  'k8s': 'kubernetes',
  'kubernetes': 'kubernetes',
  'terraform': 'terraform',
  'ansible': 'ansible',
  'ci/cd': 'cicd',
  'cicd': 'cicd',
  'github actions': 'github-actions',
  'gitlab ci': 'gitlab-ci',
  'jenkins': 'jenkins',
  'linux': 'linux',

  // AI & Data
  'ml': 'machine-learning',
  'machine learning': 'machine-learning',
  'deep learning': 'deep-learning',
  'pytorch': 'pytorch',
  'tensorflow': 'tensorflow',
  'keras': 'keras',
  'pandas': 'pandas',
  'numpy': 'numpy',
  'scikit-learn': 'scikit-learn',
  'llm': 'llm',
  'large language models': 'llm',
  'langchain': 'langchain',
  'rag': 'rag',
};

/**
 * Normalizes a raw skill name into a clean, canonical identifier.
 */
export function normalizeSkillName(rawName: string): string {
  if (!rawName) return '';
  const cleaned = rawName
    .trim()
    .toLowerCase()
    .replace(/[^\w\s\.\+#\/-]/g, '')
    .replace(/\s+/g, ' ');

  if (SKILL_ALIASES[cleaned]) {
    return SKILL_ALIASES[cleaned];
  }

  // Handle common suffix patterns (e.g., "react framework" -> "react")
  const strippedSuffix = cleaned
    .replace(/\s+(framework|library|technology|sdk|runtime|language|tools?)$/, '')
    .trim();

  if (SKILL_ALIASES[strippedSuffix]) {
    return SKILL_ALIASES[strippedSuffix];
  }

  return cleaned.replace(/\s+/g, '-');
}
