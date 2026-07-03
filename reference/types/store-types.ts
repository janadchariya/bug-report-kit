export type UserRole =
  | "EMPLOYEE"
  | "ACCOUNTING"
  | "APPROVER"
  | "HR"
  | "ADMIN";

export type ExpenseRequestStatus =
  | "draft"
  | "extracting"
  | "ready_for_review"
  | "submitted"
  | "accounting_reviewing"
  | "need_revision"
  | "pending_memo_signature"
  | "approved"
  | "paid"
  | "rejected"
  | "pending_clear"
  | "clearing_submitted"
  | "clearing_approved"
  | "completed";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "not_approved"
  | "other"
  | "cancelled";

export type AccountSource = "ai_history" | "ai_llm" | "manual";

export type DocumentType =
  | "receipt_original"
  | "extracted_data"
  | "reimbursement_form"
  | "memo_draft"
  | "memo_signed"
  /** Auto-generated cert for requests containing any CASH_BILL receipts. */
  | "substitute_receipt"
  | "audit_log";

/**
 * Tax document classification per Thai tax law.
 * - TAX_INVOICE_FULL — ใบกำกับภาษีเต็มรูป (claim input VAT)
 * - TAX_INVOICE_ABBREVIATED — ใบกำกับภาษีอย่างย่อ (limited VAT claim — registered shops)
 * - CASH_RECEIPT — ใบเสร็จรับเงิน (no VAT claim)
 * - CASH_BILL — บิลเงินสด (no VAT claim, informal)
 * - QUOTATION — ใบเสนอราคา (pre-payment quote, not a payment document)
 * - INVOICE — ใบแจ้งหนี้ (billing invoice before payment)
 * - CONTRACT — สัญญา (service/outsourcing contract)
 */
export type ReceiptDocumentType =
  | "TAX_INVOICE_FULL"
  | "TAX_INVOICE_ABBREVIATED"
  | "CASH_RECEIPT"
  | "CASH_BILL"
  | "QUOTATION"
  | "INVOICE"
  | "CONTRACT"
  | "PAYMENT_SLIP";

export type Company = {
  id: string;
  /** Display name shown in nav, e.g. "ANGA Bangkok" */
  name: string;
  /** Full legal name on documents, e.g. "ANGA Bangkok Company Limited" */
  legalName: string;
  /** Thai legal name where applicable, e.g. "บริษัท แอดฉริยะ แบงค็อก จำกัด" */
  legalNameThai?: string;
  taxId: string;
  address: string;
  addressThai?: string;
  /** Company phone — shown on legal forms (Substitute Receipt cert etc.) */
  phone?: string;
  defaultCurrency: string;
  reimbursementPrefix: string;
  memoCc: string;
  /** Primary approver (MD) — receives memo signature requests */
  primaryApproverId: string;
  /** Backup approver — fallback when primary unavailable */
  backupApproverId?: string;
  /** Approver for petty-cash (general_reimbursement) requests under the limit */
  pettyCashApproverId?: string;
  /** People & Culture / HR approver for flexi_benefit requests */
  benefitApproverId?: string;
  /** Master switch — when false, skip receipt-age validation entirely */
  dateValidationEnabled: boolean;
  /** Days before receipt date triggers warning */
  dateWarningDays: number;
  /** Days before receipt date is blocked from submit (requires admin override) */
  dateBlockDays: number;
};

export type Department = {
  id: string;
  companyId: string;
  name: string;
};

export type ExpenseCategory = {
  id: string;
  /** companyId can be 'GROUP' for categories shared across all companies */
  companyId: string;
  /** parentId set for sub-categories; null for top-level */
  parentId?: string | null;
  name: string;
  keywords: string[];
  sortOrder?: number;
};

export type NotifPrefs = {
  // EMPLOYEE events
  approved?: { chat?: boolean; email?: boolean };
  rejected?: { chat?: boolean; email?: boolean };
  revision?: { chat?: boolean; email?: boolean };
  paid?: { chat?: boolean; email?: boolean };
  /** Employee: accounting changed the company pay date */
  payDateChanged?: { chat?: boolean; email?: boolean };
  /** Employee FYI: accounting sent memo to MD */
  sentForSignature?: { chat?: boolean; email?: boolean };
  /** Employee: dup override approved or rejected */
  dupResult?: { chat?: boolean; email?: boolean };
  // ACCOUNTING events
  newSubmission?: { chat?: boolean; email?: boolean };
  accountCoding?: { chat?: boolean; email?: boolean };
  mdApproved?: { chat?: boolean; email?: boolean };
  mdRejected?: { chat?: boolean; email?: boolean };
  // APPROVER events
  /** Memo ready for signature */
  memoReady?: { chat?: boolean; email?: boolean };
  /** Reminder if memo unsigned after delayHours */
  unsignedReminder?: { chat?: boolean; email?: boolean; delayHours?: number };
  // ADMIN + HR events
  newUser?: { chat?: boolean; email?: boolean };
  /** Dup override request from employee (ADMIN + ACCOUNTING) */
  adminDupRequest?: { chat?: boolean; email?: boolean };
  /** Reporter: someone commented on a bug they reported */
  bugComment?: { chat?: boolean; email?: boolean };
};

export type User = {
  id: string;
  companyId: string;
  departmentId?: string;
  email: string;
  /** "Jan", "Gain" — paired with firstName for display. */
  nickName?: string;
  /** Given name without surname. */
  firstName?: string;
  /** Family name — used in formal Thai documents. */
  lastName?: string;
  /** Display label — "${nickName} ${firstName}" by convention. */
  fullName: string;
  /** HR-issued employee number. */
  employeeId?: string;
  position: string;
  role: UserRole;
  defaultApproverId?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNo?: string;
  /** PromptPay phone (10 digits) — alternative payment method for reimbursement */
  promptPayPhone?: string;
  /** Signature PNG (transparent BG ideal) uploaded once, embedded in signed memo */
  signatureImageUrl?: string;
  signatureUpdatedAt?: string;
  /** Google Chat incoming-webhook URL for personal notifications (Phase 4). */
  chatWebhookUrl?: string;
  /** Per-user notification preferences — absent means use all defaults (all ON). */
  notifPrefs?: NotifPrefs;
  /** False = deactivated (can't log in, hidden from approver pickers). */
  isActive: boolean;
  /** ISO timestamp — used by admin UI to flag recent signups. */
  createdAt?: string;
  /** Employee benefits — date employee started (drives Flexi tenure tier). */
  startDate?: string;
  /** Whether the employee has passed probation (gates some benefits). */
  passedProbation?: boolean;
  /** Admin override for the monthly Flexi benefit cap (THB). Null = use tenure tier. */
  monthlyBenefitCapOverride?: number | null;
};

export type ReceiptWarning = {
  code: string;
  message: string;
  field?: string;
};

export type ReceiptLineItem = {
  id: string;
  receiptId: string;
  /** Order on receipt (1-indexed) */
  sortOrder: number;
  description: string;
  /** "product" or "service" */
  itemType?: "product" | "service";
  quantity?: number;
  /** Resolved at line-item level — supports per-item categorization */
  categoryId?: string;
  chartAccountId?: string;
  accountConfidence?: number;
  accountSource?: AccountSource;
  amountBeforeVat?: number;
  vatRate?: number;
  vatAmount?: number;
  /** Final line total (before VAT + VAT — same as line subtotal) */
  amount: number;
  discount?: number;
};

export type Receipt = {
  id: string;
  expenseRequestId: string;
  originalFileUrl: string;
  originalFileName: string;
  mimeType: string;
  documentType?: ReceiptDocumentType;
  /** Eligible for input VAT claim — derived from documentType but admin can override */
  claimableVat?: boolean;
  /**
   * Include in the auto-generated ใบรับรองแทนใบเสร็จรับเงิน.
   * Undefined = type-based default; true/false = accounting decided.
   */
  substituteReceiptIncluded?: boolean;
  /** Role override: null = AI default (from documentType), true/false = explicit. */
  countsTowardTotal?: boolean | null;
  vendorId?: string;
  vendorName?: string;
  vendorBranch?: string;
  vendorTaxId?: string;
  vendorBankName?: string;
  vendorBankAccountNo?: string;
  vendorBankAccountName?: string;
  vendorBankBranch?: string;
  vendorPromptPayPhone?: string;
  receiptNo?: string;
  receiptBookNo?: string;
  receiptDate?: string;
  buyerName?: string;
  buyerTaxId?: string;
  description?: string;
  amountBeforeVat?: number;
  /** Total discount applied across the receipt (vendor markdown / line-level rolled up). */
  discount?: number;
  vatAmount?: number;
  /** Withholding tax — amount retained for remittance to RD (3% / 5% / 1%, etc.). */
  withholdingTax?: number;
  /** Vendor rounding adjustment recorded on the receipt (e.g. ปัดเศษ +/- 0.50). */
  roundingAdjustment?: number;
  grandTotal?: number;
  paymentMethod?: string;
  /** Employee free-text note about this receipt (context for accounting). */
  notes?: string;
  /** Flexi-benefit category (VISION/WELLNESS/LEARNING/GADGET) — per-receipt. */
  benefitCategory?: string;
  fieldConfidence: Record<string, number>;
  warnings: ReceiptWarning[];
  extractedAt?: string;
  /** "AI_FLAGGED" = Opus said this image is not an expense document (Gate 2). */
  relevanceFlag?: string;
  relevanceDetail?: string;
  relevanceConfirmedAt?: string;
  relevanceConfirmedById?: string;
  createdAt: string;
};

export type Vendor = {
  id: string;
  companyId: string;
  name: string;
  branch?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  bankBranch?: string;
  promptPayPhone?: string;
  /** Normalized lowercase name used for autocomplete matching */
  searchKey: string;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseRequest = {
  id: string;
  companyId: string;
  requestNo: string | null;
  employeeId: string;
  departmentId?: string;
  categoryId?: string;
  approverId?: string;
  status: ExpenseRequestStatus;
  /**
   * Who gets paid. Drives pay-date predictor copy ("you'll receive" vs
   * "vendor will receive"). Defaults to employee_reimbursement which
   * is by far the common case.
   */
  payee: "employee_reimbursement" | "vendor_direct";
  vendorBankName?: string;
  vendorBankAccountNo?: string;
  vendorBankAccountName?: string;
  vendorBankBranch?: string;
  vendorPromptPayPhone?: string;

  employeeBankName?: string;
  employeeBankAccountNo?: string;
  employeeBankAccountName?: string;
  employeePromptPayPhone?: string;
  /** When set, the reimbursement is paid to this user (not the submitter). */
  reimbursementRecipientId?: string;
  /** Free-text note for accounting, e.g. "เบิกแทนพี่เกน / CEO". */
  reimbursementNote?: string;
  /** Expense type slug picked by employee at create time. */
  expenseType?: string;
  /** Type-specific field values (key → value). Driven by lib/expense-types.ts. */
  typeSpecificFields?: Record<string, string>;
  purpose?: string;
  businessReason?: string;
  accountName?: string;
  clientOrEventName?: string;
  reimbursementAmount?: number;
  currency: string;
  paidByEmployeeDate?: string;
  submittedAt?: string;
  accountingReviewedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  paymentReference?: string;
  accountingNote?: string;
  employeeNote?: string;
  /** Admin who overrode date validation (when receipt > dateBlockDays old) */
  dateOverrideApprovedBy?: string;
  dateOverrideReason?: string;
  payDateOverride?: string;
  payDateOverrideReason?: string;
  /** Google Drive folder URL where docs were archived (set on mark paid). */
  driveArchiveUrl?: string;
  driveArchivedAt?: string;
  /** URL of the transfer slip uploaded when employee returns leftover advance. */
  clearingTransferSlipUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type Document = {
  id: string;
  expenseRequestId?: string;
  creditCardRequestId?: string;
  type: DocumentType;
  version: number;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  generatedById?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type Approval = {
  id: string;
  expenseRequestId: string;
  approverId: string;
  status: ApprovalStatus;
  decisionComment?: string;
  signatureName?: string;
  /** URL to signature image used at time of signing (snapshot) */
  signatureImageUrl?: string;
  signedDocumentId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestedAt: string;
  decidedAt?: string;
};

export type AuditLog = {
  id: string;
  expenseRequestId?: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
};

export type ChartAccount = {
  id: string;
  companyId: string;
  code: string;
  subCode: string;
  nameTh: string;
  nameEn?: string;
  accountType: number;
  isExpense: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type AdvanceItem = {
  id: string;
  expenseRequestId: string;
  description: string;
  estimatedAmount: number;
  sortOrder: number;
  createdAt: string;
  clearingItem?: AdvanceClearingItem | null;
};

export type AdvanceClearingItem = {
  id: string;
  advanceItemId: string;
  actualAmount: number;
  receiptUrl?: string | null;
  receiptFileName?: string | null;
  notes?: string | null;
  createdAt: string;
};
