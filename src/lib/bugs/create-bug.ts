import { prisma } from "@/lib/db/prisma";

import { mapBugReport } from "./mappers";
import type {
  BugDeviceType,
  BugReport,
} from "./types";

export type CreateBugInput = {
  /** Server-issued UUID returned from /api/bugs/upload-url. */
  bugId: string;
  companyId: string;
  reporterId: string;
  summary: string;
  description: string | null;
  screenshotPath: string;
  screenshotWidth: number;
  screenshotHeight: number;
  pageUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  userAgent: string;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  browserVersion: string | null;
  deviceType: BugDeviceType | null;
  appBuildSha: string | null;
};

export async function createBug(input: CreateBugInput): Promise<BugReport> {
  if (!input.summary.trim()) {
    throw new Error("Cannot create bug: summary is required");
  }
  const row = await prisma.bugReport.create({
    data: {
      id: input.bugId,
      companyId: input.companyId,
      reporterId: input.reporterId,
      summary: input.summary.trim(),
      description: input.description?.trim() || null,
      screenshotPath: input.screenshotPath,
      screenshotWidth: input.screenshotWidth,
      screenshotHeight: input.screenshotHeight,
      pageUrl: input.pageUrl,
      viewportWidth: input.viewportWidth,
      viewportHeight: input.viewportHeight,
      userAgent: input.userAgent,
      osName: input.osName,
      osVersion: input.osVersion,
      browserName: input.browserName,
      browserVersion: input.browserVersion,
      deviceType: input.deviceType,
      appBuildSha: input.appBuildSha,
    },
  });
  return mapBugReport(row);
}
