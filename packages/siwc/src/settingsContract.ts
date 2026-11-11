/** Shared, credential-free projection sent to the Settings client. */
export interface SiwcStatus {
  account?: { id: string; label: string };
  models: { id: string; name: string }[];
  usageUrl: string;
}
