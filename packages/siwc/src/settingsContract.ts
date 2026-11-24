/** Credential-free projections and actions shared by the SIWC Settings Host and Client. */
export interface SiwcAccount {
  id: string;
  label: string;
  active: boolean;
  signedIn: boolean;
}

export interface SiwcPrompt {
  kind: "select";
  message: string;
  options: { id: string; label: string }[];
}

export interface SiwcAttempt {
  id: string;
  method: "oauth" | "select";
  phase: "running" | "authorized" | "cancelled" | "failed";
  notice?: { message: string; url?: string };
  prompt?: SiwcPrompt;
  error?: string;
}

export interface SiwcStatus {
  account?: { id: string; label: string };
  accounts: SiwcAccount[];
  models: { id: string; name: string }[];
  usageUrl: string;
  attempt?: SiwcAttempt;
}

export interface SiwcActionResult {
  status: SiwcStatus;
  message?: string;
}
