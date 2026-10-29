export function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}


const LEGAL_FORMS = [
  "public company limited", "company limited", "co., ltd.", "co.,ltd.", "co.ltd", "(มหาชน)", "บริษัท", "บมจ.", "บจก.", "บจ.",
  "จำกัด", "มหาชน", "limited", "ltd.", "ltd", "inc.", "inc", "pcl",
].map((form) => form.normalize("NFKC"));

export function normalizeCompanyName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.normalize("NFKC").toLowerCase();
  for (const form of LEGAL_FORMS) value = value.split(form).join(" ");
  value = value.replace(/[\p{P}\p{S}\s]+/gu, "");
  return value || null;
}
