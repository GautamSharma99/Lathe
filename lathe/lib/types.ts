export type JobStatus =
  | 'pending'
  | 'wire_check'
  | 'crawling'
  | 'inferring'
  | 'generating'
  | 'done'
  | 'failed'

export type ServerType = 'crawled' | 'wire' | 'agentic'

export interface Server {
  id: string
  slug: string
  name: string
  description: string
  source_url: string
  schema_json: string
  mcp_config: string
  server_type: ServerType
  wire_action_id: string | null
  install_count: number
  created_at: string
  last_crawled_at: string | null
  cached_data: string | null
}

export interface Job {
  id: string
  status: JobStatus
  step: string | null
  badges: string        // JSON array string
  server_id: string | null
  error: string | null
  created_at: string
}

export interface WireAction {
  id: string
  name: string
  description?: string
  url?: string
  input_schema?: Record<string, unknown>
  schema?: Record<string, unknown>
  credits_per_call?: number
  auth_type?: string
}

export interface CrawlPage {
  url: string
  markdown?: string
  html?: string
  generatedJson?: Record<string, unknown>
  data_schema?: Record<string, unknown>
}

export interface CrawlResult {
  status: string
  pages?: CrawlPage[]
  data?: CrawlPage[]
}
