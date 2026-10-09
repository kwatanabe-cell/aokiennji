export type Availability = 'available' | 'orderable' | 'needs_review' | 'unavailable';
export type SourceKind =
  | 'manual'
  | 'csv'
  | 'xlsx'
  | 'supplier_catalog'
  | 'pdf'
  | 'docx'
  | 'text'
  | 'website'
  | 'csv_url'
  | 'json_api';
export type Trust = 'internal' | 'approved_supplier' | 'discovery';
export type Visibility = 'public' | 'internal';
export type Flags = {
  chat: boolean;
  webSearch: boolean;
  showPrice: boolean;
  showStock: boolean;
  showLeadTime: boolean;
  quoteRequests: boolean;
  autoQuote: boolean;
  orders: boolean;
  autoOrder: boolean;
  humanHandoff: boolean;
};
export interface AppSettings {
  flags: Flags;
  searchProvider: 'none' | 'exa' | 'tavily';
  decisionProvider: 'local' | 'gemini' | 'jev';
  model: string;
  responseProvider: 'local' | 'openai' | 'gemini';
  responseModel: string;
  freshnessHours: number;
  maxAutoOrderAmount: number;
  companyName: string;
  welcomeMessage: string;
}
export interface PublicConfig {
  flags: Flags;
  demoMode: boolean;
  welcomeMessage: string;
}
export interface ProductInput {
  name: string;
  model: string;
  manufacturer: string;
  category: string;
  description: string;
  specifications: string;
  image: string;
  availability: Availability;
  price: number | null;
  stock: number | null;
  leadTime: string;
  sourceId: string | null;
  supplierId: string | null;
  approved: boolean;
  visibility: Visibility;
  verifiedAt: string | null;
  isDemo: boolean;
}
export interface Product extends ProductInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  evidence?: Evidence[];
}
export interface SourceInput {
  name: string;
  kind: SourceKind;
  url: string;
  enabled: boolean;
  trust: Trust;
  visibility: Visibility;
  syncIntervalHours: number;
  config: {
    authEnv?: string;
    itemsPath?: string;
    mapping?: Record<string, string>;
    text?: string;
    allowedDomains?: string[];
    answerEnabled?: boolean;
  };
}
export interface Source extends SourceInput {
  id: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  recordCount: number;
  createdAt: string;
}
export interface SourceRun {
  id: string;
  sourceId: string;
  status: 'success' | 'failed';
  count: number;
  message: string;
  createdAt: string;
}
export interface SupplierInput {
  name: string;
  approved: boolean;
  enabled: boolean;
  domains: string[];
  orderEndpoint: string;
  authEnv: string;
  notes: string;
}
export interface Supplier extends SupplierInput {
  id: string;
  createdAt: string;
}
// Private records. Only approved field labels may be returned to customers.
export interface SupplierKnowledgeRow {
  supplierName: string;
  website: string;
  products: string;
  fields: string[];
  sheet: string;
  row: number;
}
export interface SupplierKnowledge extends SupplierKnowledgeRow {
  id: string;
  sourceId: string;
  approved: boolean;
  importedAt: string;
}
export interface KnowledgeTopic {
  fields: string[];
  mode: 'fields' | 'privacy' | 'scope';
}
export interface Evidence {
  id?: string;
  title: string;
  url?: string;
  excerpt: string;
  retrievedAt: string;
  sourceId?: string;
  visibility: Visibility;
  trust: Trust;
}
export interface QueryIntent {
  intent: 'product' | 'price' | 'stock' | 'lead_time' | 'quote' | 'order' | 'custom' | 'general';
  terms: string[];
  model?: string;
  confidence: number;
  provider: string;
  warning?: string;
  referencesPrevious?: boolean;
  topicField?: string;
  evidenceIndex?: number;
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  knowledge?: KnowledgeTopic;
  createdAt: string;
  products?: Product[];
  evidence?: Evidence[];
  suggestions?: string[];
  intent?: QueryIntent['intent'];
  factualIntents?: ('price' | 'stock' | 'lead_time' | 'quote' | 'order')[];
  presentation?: 'products' | 'reply' | 'selection';
  requestedQuantity?: number;
  responseProvider?: 'local' | 'openai' | 'gemini';
  groundingHash?: string;
}
export interface Conversation {
  id: string;
  title: string;
  status: 'open' | 'handed_off' | 'closed';
  createdAt: string;
  updatedAt: string;
}
export interface ChatResponse {
  conversationId: string;
  message: ChatMessage;
}
export interface InquiryInput {
  name: string;
  company: string;
  email: string;
  message: string;
  conversationId?: string;
  consent: boolean;
}
export interface Inquiry extends InquiryInput {
  id: string;
  status: 'new' | 'in_progress' | 'resolved';
  notes: string;
  createdAt: string;
}
export interface QuoteRequestInput {
  name: string;
  company: string;
  email: string;
  message: string;
  consent: boolean;
  productId?: string;
  quantity: number;
  conversationId?: string;
}
export interface QuoteLine {
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
}
export interface Quote {
  id: string;
  token: string;
  name: string;
  company: string;
  email: string;
  message: string;
  lines: QuoteLine[];
  shipping: number;
  taxRate: number;
  subtotal: number;
  tax: number;
  total: number;
  status: 'requested' | 'draft' | 'issued' | 'accepted' | 'cancelled';
  expiresAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
}
export interface Order {
  id: string;
  quoteId: string;
  supplierId: string | null;
  status:
    | 'pending_approval'
    | 'approved'
    | 'dispatched'
    | 'simulated'
    | 'failed'
    | 'needs_reconciliation';
  total: number;
  isDemo: boolean;
  externalId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AuditEvent {
  id: string;
  action: string;
  entityId: string;
  summary: string;
  createdAt: string;
}
export interface AiUsageContext {
  scope: 'chat' | 'connection_check' | 'standalone';
  conversationId?: string;
  turnId?: string;
}
export interface AiCall {
  id: string;
  createdAt: string;
  completedAt: string | null;
  provider: 'openai' | 'jev';
  purpose: 'classification' | 'response';
  context: AiUsageContext;
  model: string;
  endpoint: string;
  method: 'POST';
  requestBytes: number;
  requestShape: Record<string, unknown>;
  httpStatus: number | null;
  requestId: string | null;
  durationMs: number | null;
  outcome: 'pending' | 'accepted' | 'rejected' | 'http_error' | 'network_error';
  errorCode: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number | null;
    reasoningTokens: number | null;
  } | null;
}
export interface AiUsageReport {
  recordingStartedAt: string | null;
  total: number;
  summaries: {
    provider: 'openai' | 'jev';
    calls: number;
    httpSuccess: number;
    accepted: number;
    rejected: number;
    failed: number;
    pending: number;
    usageReportedCalls: number;
    inputTokens: number | null;
    outputTokens: number | null;
    cachedInputTokens: number | null;
    cachedUsageReportedCalls: number;
  }[];
  items: AiCall[];
}
export interface Overview {
  products: number;
  sources: number;
  conversations: number;
  inquiries: number;
  quotes: number;
  orders: number;
  pendingInquiries: number;
  pendingOrders: number;
  recentEvents: AuditEvent[];
  demoMode: boolean;
}
export interface ImportRowError {
  row: number;
  message: string;
}
export interface ParsedSource {
  supplierRows?: SupplierKnowledgeRow[];
  headers: string[];
  rows: Record<string, string>[];
  documents: { title: string; content: string; url?: string }[];
  warnings: string[];
}
export interface ImportPreview extends ParsedSource {
  previewId: string;
  sourceId: string;
  fileName: string;
  suggestedMapping: Record<string, string>;
  totalRows: number;
}
export interface ImportResult {
  imported: number;
  updated: number;
  documents: number;
  errors: ImportRowError[];
  warnings: string[];
}
export interface ProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  envKey: string;
  purpose: string;
  check?: ProviderCheck;
}
export interface ProviderCheck {
  ok: boolean;
  checkedAt: string;
  model: string;
  message: string;
  durationMs: number;
}
export interface DispatchResult {
  externalId: string;
  status: 'dispatched' | 'needs_reconciliation';
  message?: string;
}
export interface ApiResult<T> {
  data?: T;
  error?: { code: string; message: string };
}

export const DEFAULT_SETTINGS: AppSettings = {
  flags: {
    chat: true,
    webSearch: false,
    showPrice: true,
    showStock: true,
    showLeadTime: true,
    quoteRequests: true,
    autoQuote: false,
    orders: false,
    autoOrder: false,
    humanHandoff: true,
  },
  searchProvider: 'none',
  decisionProvider: 'local',
  model: '',
  responseProvider: 'local',
  responseModel: '',
  freshnessHours: 168,
  maxAutoOrderAmount: 100000,
  companyName: 'アオキエンジ株式会社',
  welcomeMessage:
    'お探しの製品や、ものづくりのお困りごとをお聞かせください。商品名・型番・用途からご案内します。',
};
export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: '取扱あり',
  orderable: '取り寄せ対応',
  needs_review: '要確認',
  unavailable: '取扱対象外',
};
export const SOURCE_LABELS: Record<SourceKind, string> = {
  manual: '手動登録',
  csv: 'CSV',
  xlsx: 'Excel',
  supplier_catalog: '仕入・外注先一覧（Excel）',
  pdf: 'PDF',
  docx: 'Word',
  text: 'テキスト',
  website: 'Webサイト',
  csv_url: '公開CSV・スプレッドシート',
  json_api: 'REST API',
};
