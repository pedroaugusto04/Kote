export type AgentToolParameter = {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
};

export type AgentTool = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, AgentToolParameter>;
    required?: string[];
  };
  execute: (args: Record<string, any>) => Promise<unknown>;
};
