/**
 * Share Service Unit Tests
 * Tests core functionality of share link management
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { db } from "../db";
import { shareLinks } from "../db/schema/share.schema";
import { video, project, viralClip } from "../db/schema/project.schema";
import { workspace, workspaceMember } from "../db/schema/workspace.schema";
import { user } from "../db/schema/user.schema";
import { eq, and, isNull } from "drizzle-orm";
import { ShareService } from "./share.service";
import { randomUUID } from "crypto";

describe("ShareService", () => {
  let testWorkspaceId: string;
  let testUserId: string;
  let testProjectId: string;
  let testVideoId: string;
  let testClipId: string;

  beforeAll(async () => {
    // Create test user
    testUserId = randomUUID();
    await db.insert(user).values({
      id: testUserId,
      email: `test-share-${Date.now()}@example.com`,
      name: "Test User",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create test workspace
    testWorkspaceId = randomUUID();
    await db.insert(workspace).values({
      id: testWorkspaceId,
      name: "Test Workspace",
      slug: `test-workspace-${Date.now()}`,
      plan: "pro",
      ownerId: testUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add user to workspace
    await db.insert(workspaceMember).values({
      id: randomUUID(),
      workspaceId: testWorkspaceId,
      userId: testUserId,
      role: "owner",
      createdAt: new Date(),
    });

    // Create test project
    testProjectId = randomUUID();
    await db.insert(project).values({
      id: testProjectId,
      workspaceId: testWorkspaceId,
      name: "Test Project",
      createdBy: testUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create test video
    testVideoId = randomUUID();
    await db.insert(video).values({
      id: testVideoId,
      projectId: testProjectId,
      workspaceId: testWorkspaceId,
      userId: testUserId,
      title: "Test Video",
      sourceType: "upload",
      status: "completed",
      duration: 120,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create test clip
    testClipId = randomUUID();
    await db.insert(viralClip).values({
      id: testClipId,
      videoId: testVideoId,
      title: "Test Clip",
      startTime: 0,
      endTime: 10,
      duration: 10,
      score: 85,
      viralityReason: "Test reason",
      hooks: ["hook1", "hook2"],
      aspectRatio: "9:16",
      status: "ready",
      thumbnailUrl: "https://example.com/thumbnail.jpg",
      storageUrl: "https://example.com/clip.mp4",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(viralClip).where(eq(viralClip.id, testClipId));
    await db.delete(shareLinks).where(eq(shareLinks.videoId, testVideoId));
    await db.delete(video).where(eq(video.id, testVideoId));
    await db.delete(project).where(eq(project.id, testProjectId));
    await db.delete(workspaceMember).where(eq(workspaceMember.workspaceId, testWorkspaceId));
    await db.delete(workspace).where(eq(workspace.id, testWorkspaceId));
    await db.delete(user).where(eq(user.id, testUserId));
  });

  beforeEach(async () => {
    // Clean up any existing share links before each test
    await db.delete(shareLinks).where(eq(shareLinks.videoId, testVideoId));
  });

  describe("createShareLink", () => {
    test("should create a new share link with UUID v4 token", async () => {
      const shareLink = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );

      expect(shareLink).toBeDefined();
      expect(shareLink.id).toBeDefined();
      expect(shareLink.token).toBeDefined();
      expect(shareLink.videoId).toBe(testVideoId);
      expect(shareLink.workspaceId).toBe(testWorkspaceId);
      expect(shareLink.createdAt).toBeInstanceOf(Date);
      expect(shareLink.revokedAt).toBeNull();

      // Verify token is UUID v4 format
      expect(ShareService.isValidToken(shareLink.token)).toBe(true);
    });

    test("should return existing share link (idempotence)", async () => {
      // Create first share link
      const firstLink = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );

      // Create second share link (should return same)
      const secondLink = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );

      expect(secondLink.id).toBe(firstLink.id);
      expect(secondLink.token).toBe(firstLink.token);
      expect(secondLink.videoId).toBe(firstLink.videoId);
    });

    test("should create new link after revocation", async () => {
      // Create and revoke first link
      const firstLink = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );
      await ShareService.revokeShareLink(testVideoId, testWorkspaceId);

      // Create new link
      const secondLink = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );

      expect(secondLink.id).not.toBe(firstLink.id);
      expect(secondLink.token).not.toBe(firstLink.token);
    });
  });

  describe("getShareLinkByVideoId", () => {
    test("should return share link for video", async () => {
      // Create share link
      const created = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );

      // Get by video ID
      const found = await ShareService.getShareLinkByVideoId(testVideoId);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.token).toBe(created.token);
    });

    test("should return null for non-existent video", async () => {
      const found = await ShareService.getShareLinkByVideoId("non-existent-id");
      expect(found).toBeNull();
    });

    test("should return null for revoked share link", async () => {
      // Create and revoke
      await ShareService.createShareLink(testVideoId, testWorkspaceId);
      await ShareService.revokeShareLink(testVideoId, testWorkspaceId);

      // Should not find revoked link
      const found = await ShareService.getShareLinkByVideoId(testVideoId);
      expect(found).toBeNull();
    });
  });

  describe("revokeShareLink", () => {
    test("should soft delete share link", async () => {
      // Create share link
      const shareLink = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );

      // Revoke it
      await ShareService.revokeShareLink(testVideoId, testWorkspaceId);

      // Verify it's revoked in database
      const revoked = await db.query.shareLinks.findFirst({
        where: eq(shareLinks.id, shareLink.id),
      });

      expect(revoked).toBeDefined();
      expect(revoked?.revokedAt).toBeInstanceOf(Date);
      expect(revoked?.revokedAt).not.toBeNull();
    });

    test("should not affect other workspace's share links", async () => {
      // Create share link
      const shareLink = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );

      // Try to revoke with different workspace ID
      await ShareService.revokeShareLink(testVideoId, "different-workspace-id");

      // Verify original link is still active
      const found = await ShareService.getShareLinkByVideoId(testVideoId);
      expect(found).toBeDefined();
      expect(found?.revokedAt).toBeNull();
    });
  });

  describe("regenerateShareLink", () => {
    test("should create new token and revoke old one", async () => {
      // Create first link
      const firstLink = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );

      // Regenerate
      const newLink = await ShareService.regenerateShareLink(
        testVideoId,
        testWorkspaceId
      );

      // Verify new link is different
      expect(newLink.id).not.toBe(firstLink.id);
      expect(newLink.token).not.toBe(firstLink.token);
      expect(newLink.videoId).toBe(testVideoId);

      // Verify old link is revoked
      const oldLink = await db.query.shareLinks.findFirst({
        where: eq(shareLinks.id, firstLink.id),
      });
      expect(oldLink?.revokedAt).not.toBeNull();
    });
  });

  describe("getPublicShareData", () => {
    test("should return sanitized public data", async () => {
      // Create share link
      const shareLink = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );

      // Get public data
      const publicData = await ShareService.getPublicShareData(shareLink.token);

      expect(publicData).toBeDefined();
      expect(publicData?.videoTitle).toBe("Test Video");
      expect(publicData?.clipCount).toBe(1);
      expect(publicData?.clips).toHaveLength(1);

      // Verify clip data
      const clip = publicData?.clips[0];
      expect(clip?.id).toBe(testClipId);
      expect(clip?.title).toBe("Test Clip");
      expect(clip?.duration).toBe(10);
      expect(clip?.viralityScore).toBe(85);
      expect(clip?.hooks).toEqual(["hook1", "hook2"]);
    });

    test("should return null for invalid token format", async () => {
      const publicData = await ShareService.getPublicShareData("invalid-token");
      expect(publicData).toBeNull();
    });

    test("should return null for non-existent token", async () => {
      const fakeToken = randomUUID();
      const publicData = await ShareService.getPublicShareData(fakeToken);
      expect(publicData).toBeNull();
    });

    test("should return null for revoked token", async () => {
      // Create and revoke
      const shareLink = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );
      await ShareService.revokeShareLink(testVideoId, testWorkspaceId);

      // Should not return data
      const publicData = await ShareService.getPublicShareData(shareLink.token);
      expect(publicData).toBeNull();
    });

    test("should not expose workspace information", async () => {
      // Create share link
      const shareLink = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );

      // Get public data
      const publicData = await ShareService.getPublicShareData(shareLink.token);

      // Verify no workspace info in response
      const dataString = JSON.stringify(publicData);
      expect(dataString).not.toContain(testWorkspaceId);
      expect(dataString).not.toContain("Test Workspace");
      expect(dataString).not.toContain(testUserId);
    });

    test("should sort clips by virality score descending", async () => {
      // Create additional clips with different scores
      const clip2Id = randomUUID();
      await db.insert(viralClip).values({
        id: clip2Id,
        videoId: testVideoId,
        title: "High Score Clip",
        startTime: 10,
        endTime: 20,
        duration: 10,
        score: 95,
        aspectRatio: "9:16",
        status: "ready",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const clip3Id = randomUUID();
      await db.insert(viralClip).values({
        id: clip3Id,
        videoId: testVideoId,
        title: "Low Score Clip",
        startTime: 20,
        endTime: 30,
        duration: 10,
        score: 70,
        aspectRatio: "9:16",
        status: "ready",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create share link
      const shareLink = await ShareService.createShareLink(
        testVideoId,
        testWorkspaceId
      );

      // Get public data
      const publicData = await ShareService.getPublicShareData(shareLink.token);

      // Verify sorting
      expect(publicData?.clips).toHaveLength(3);
      expect(publicData?.clips[0]?.viralityScore).toBe(95);
      expect(publicData?.clips[1]?.viralityScore).toBe(85);
      expect(publicData?.clips[2]?.viralityScore).toBe(70);

      // Clean up
      await db.delete(viralClip).where(eq(viralClip.id, clip2Id));
      await db.delete(viralClip).where(eq(viralClip.id, clip3Id));
    });
  });

  describe("isValidToken", () => {
    test("should validate correct UUID v4 format", () => {
      const validTokens = [
        "550e8400-e29b-41d4-a716-446655440000",
        "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
        "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      ];

      validTokens.forEach((token) => {
        expect(ShareService.isValidToken(token)).toBe(true);
      });
    });

    test("should reject invalid token formats", () => {
      const invalidTokens = [
        "not-a-uuid",
        "123",
        "",
        "550e8400-e29b-11d4-a716-446655440000", // UUID v1
        "550e8400-e29b-21d4-a716-446655440000", // UUID v2
        "550e8400-e29b-31d4-a716-446655440000", // UUID v3
        "550e8400-e29b-51d4-a716-446655440000", // UUID v5
        "550e8400e29b41d4a716446655440000", // No hyphens
        "550e8400-e29b-41d4-a716", // Incomplete
      ];

      invalidTokens.forEach((token) => {
        expect(ShareService.isValidToken(token)).toBe(false);
      });
    });

    test("should be case insensitive", () => {
      const token = "550e8400-e29b-41d4-a716-446655440000";
      const upperToken = token.toUpperCase();
      const mixedToken = "550E8400-e29b-41D4-A716-446655440000";

      expect(ShareService.isValidToken(token)).toBe(true);
      expect(ShareService.isValidToken(upperToken)).toBe(true);
      expect(ShareService.isValidToken(mixedToken)).toBe(true);
    });
  });
});
