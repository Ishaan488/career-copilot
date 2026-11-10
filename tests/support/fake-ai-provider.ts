import {
  AIProvider,
  GenerateStructuredRequest,
  GenerateStructuredResult,
} from '../../src/modules/ai/types';

export class FakeAIProvider implements AIProvider {
  readonly name = 'fake';
  public calls: Array<GenerateStructuredRequest<unknown>> = [];
  private queuedResponses: Map<string, unknown[]> = new Map();
  private queuedErrors: Map<string, Error[]> = new Map();

  enqueueResponse(task: string, data: unknown): void {
    const list = this.queuedResponses.get(task) || [];
    list.push(data);
    this.queuedResponses.set(task, list);
  }

  enqueueError(task: string, error: Error): void {
    const list = this.queuedErrors.get(task) || [];
    list.push(error);
    this.queuedErrors.set(task, list);
  }

  async generateStructured<T>(
    req: GenerateStructuredRequest<T>
  ): Promise<GenerateStructuredResult> {
    this.calls.push(req as GenerateStructuredRequest<unknown>);

    const errorQueue = this.queuedErrors.get(req.task);
    if (errorQueue && errorQueue.length > 0) {
      const err = errorQueue.shift()!;
      throw err;
    }

    const responseQueue = this.queuedResponses.get(req.task);
    if (responseQueue && responseQueue.length > 0) {
      const data = responseQueue.shift()!;
      return {
        data,
        raw: JSON.stringify(data),
        usage: {
          inTokens: 120,
          outTokens: 85,
        },
      };
    }

    // Default mock response based on task
    if (req.task === 'jd_analysis') {
      const mockAnalysis = {
        responsibilities: [
          'Design and implement scalable backend microservices and APIs',
          'Collaborate with frontend engineers on REST and GraphQL interfaces',
          'Maintain high test coverage and observability across services',
        ],
        seniority: 'senior',
        domain: 'backend',
        techStack: ['typescript', 'nodejs', 'postgresql', 'docker'],
        experienceMinYears: 4,
        experienceMaxYears: 8,
        educationRequirements: [
          { degree: "Bachelor's in Computer Science or equivalent", mandatory: false },
        ],
        employmentType: 'full_time',
        locationConstraints: ['Remote in India or US timezone overlap'],
        compMentions: [
          { text: '$140k - $180k', min: 140000, max: 180000, currency: 'USD', period: 'yearly' },
        ],
        applicationConditions: [],
        ambiguities: [],
        skills: [
          {
            name: 'TypeScript',
            level: 'required',
            mandatory: true,
            quote: 'Strong experience with TypeScript',
            minYears: 4,
          },
          {
            name: 'PostgreSQL',
            level: 'required',
            mandatory: true,
            quote: 'Proficiency in relational databases such as PostgreSQL',
            minYears: 3,
          },
          {
            name: 'Docker',
            level: 'preferred',
            mandatory: false,
            quote: 'Familiarity with containerization and Docker is a plus',
            minYears: null,
          },
        ],
        injection_suspected: false,
      };

      return {
        data: mockAnalysis,
        raw: JSON.stringify(mockAnalysis),
        usage: {
          inTokens: 250,
          outTokens: 180,
        },
      };
    }

    throw new Error(`No scripted response or default available for task: ${req.task}`);
  }

  async generateText(_req: {
    system: string;
    prompt: string;
    model: string;
  }): Promise<{ text: string; usage?: { inTokens: number; outTokens: number } }> {
    return {
      text: 'Mock generated text',
      usage: { inTokens: 50, outTokens: 25 },
    };
  }

  reset(): void {
    this.calls = [];
    this.queuedResponses.clear();
    this.queuedErrors.clear();
  }
}
