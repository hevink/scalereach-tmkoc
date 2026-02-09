/**
 * Property-Based Tests: Public Clips Sharing - Database Schema
 * 
 * Tests database schema correctness for share links and analytics tables.
 * Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5, 19.6
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../index";
import { shareLinks, shareAnalytics } from "./share.schema";
import { video, project } from "./project.schema";
import { workspace } from "./workspace.schema";
import { user } from "./user.schema";
import { eq, and, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

// Test data cleanup
const testIds = {
  users: [] as string[],
  workspaces: [] as string[],
  projects: [] as string[],
  videos: [] as string[],
  shareLinks: [] as string[],
  shareAnalytics: [] as string[],
};

// Helper to create test user
async function createTestUser() {
  const userId = nanoid();
  testIds.users.push(userId);
  
  await db.insert(user).values({
    id: userId,
    name: `Test User ${userId}`,
    email: `test-${userId}@example.com`,
    username: `testuser-${userId}`,
    emailVerified: true,
  });
  
  return userId;
}

// Helper to create test workspace
async function createTestWorkspace(userId: string) {
  const workspaceId = nanoid();
  testIds.workspaces.push(workspaceId);
  
  await db.insert(workspace).values({
    id: workspaceId,
    name: `Test Workspace ${workspaceId}`,
    slug: `test-workspace-${workspaceId}`,
    ownerId: userId,
    plan: "pro", // Pro plan for sharing
  });
  
  return workspaceId;
}

// Helper to create test project
async function createTestProject(workspaceId: string, userId: string) {
  const projectId = nanoid();
  testIds.projects.push(projectId);
  
  await db.insert(project).values({
    id: projectId,
    workspaceId,
    name: `Test Project ${projectId}`,
    createdBy: userId,
  });
  
  return projectId;
}

// Helper to create test video
async function createTestVideo(projectId: string, workspaceId: string, userId: string) {
  const videoId = nanoid();
  testIds.videos.push(videoId);
  
  await db.insert(video).values({
    id: videoId,
    projectId,
    workspaceId,
    userId,
    sourceType: "upload",
    title: `Test Video ${videoId}`,
    status: "completed",
  });
  
  return videoId;
}

// Cleanup function
async function cleanup() {
  // Delete in reverse order of dependencies
  if (testIds.shareAnalytics.length > 0) {
    await db.delete(shareAnalytics).where(
      eq(shareAnalytics.id, testIds.shareAnalytics[0])
    );
  }
  
  if (testIds.shareLinks.length > 0) {
    await db.delete(shareLinks).where(
      eq(shareLinks.id, testIds.shareLinks[0])
    );
  }
  
  if (testIds.videos.length > 0) {
    await db.delete(video).where(
      eq(video.id, testIds.videos[0])
    );
  }
  
  if (testIds.projects.length > 0) {
    await db.delete(project).where(
      eq(project.id, testIds.projects[0])
    );
  }
  
  if (testIds.workspaces.length > 0) {
    await db.delete(workspace).where(
      eq(workspace.id, testIds.workspaces[0])
    );
  }
  
  if (testIds.users.length > 0) {
    await db.delete(user).where(
      eq(user.id, testIds.users[0])
    );
  }
  
  // Clear arrays
  testIds.users = [];
  testIds.workspaces = [];
  testIds.projects = [];
  testIds.videos = [];
  testIds.shareLinks = [];
  testIds.shareAnalytics = [];
}

afterAll(async () => {
  await cleanup();
});

describe("Property-Based Tests: Public Clips Sharing - Database Schema", () => {
  /**
   * Feature: public-clips-sharing, Property 4: Share Link Persistence
   * 
   * For any video and workspace combination, when a share link is created,
   * querying the database with the video ID should return the same share token.
   * 
   * Validates: Requirements 2.4
   */
  test("Property 4: Share links persist correctly in database", async () => {
    // Setup test data
    const userId = await createTestUser();
    const workspaceId = await createTestWorkspace(userId);
    const projectId = await createTestProject(workspaceId, userId);
    const videoId = await createTestVideo(projectId, workspaceId, userId);
    
    // Generate a unique token (UUID v4 format)
    const token = crypto.randomUUID();
    const shareLinkId = nanoid();
    testIds.shareLinks.push(shareLinkId);
    
    // Insert share link
    const [insertedLink] = await db.insert(shareLinks).values({
      id: shareLinkId,
      token,
      videoId,
      workspaceId,
    }).returning();
    
    // Verify insertion
    expect(insertedLink).toBeDefined();
    expect(insertedLink.token).toBe(token);
    expect(insertedLink.videoId).toBe(videoId);
    expect(insertedLink.workspaceId).toBe(workspaceId);
    expect(insertedLink.revokedAt).toBeNull();
    
    // Query by video ID
    const queriedLink = await db.query.shareLinks.findFirst({
      where: and(
        eq(shareLinks.videoId, videoId),
        isNull(shareLinks.revokedAt)
      ),
    });
    
    // Verify persistence - same token returned
    expect(queriedLink).toBeDefined();
    expect(queriedLink?.token).toBe(token);
    expect(queriedLink?.id).toBe(shareLinkId);
    
    // Query by token
    const queriedByToken = await db.query.shareLinks.findFirst({
      where: eq(shareLinks.token, token),
    });
    
    // Verify token lookup works
    expect(queriedByToken).toBeDefined();
    expect(queriedByToken?.videoId).toBe(videoId);
    expect(queriedByToken?.workspaceId).toBe(workspaceId);
    
    // Cleanup
    await cleanup();
  });
  
  /**
   * Test: Share link soft deletion with revokedAt timestamp
   * 
   * Validates: Requirements 19.5
   */
  test("Share links support soft deletion via revokedAt", async () => {
    // Setup test data
    const userId = await createTestUser();
    const workspaceId = await createTestWorkspace(userId);
    const projectId = await createTestProject(workspaceId, userId);
    const videoId = await createTestVideo(projectId, workspaceId, userId);
    
    const token = crypto.randomUUID();
    const shareLinkId = nanoid();
    testIds.shareLinks.push(shareLinkId);
    
    // Insert share link
    await db.insert(shareLinks).values({
      id: shareLinkId,
      token,
      videoId,
      workspaceId,
    });
    
    // Verify active link
    const activeLink = await db.query.shareLinks.findFirst({
      where: and(
        eq(shareLinks.videoId, videoId),
        isNull(shareLinks.revokedAt)
      ),
    });
    expect(activeLink).toBeDefined();
    
    // Soft delete (revoke)
    const revokedAt = new Date();
    await db.update(shareLinks)
      .set({ revokedAt })
      .where(eq(shareLinks.id, shareLinkId));
    
    // Verify link is revoked
    const revokedLink = await db.query.shareLinks.findFirst({
      where: eq(shareLinks.id, shareLinkId),
    });
    expect(revokedLink?.revokedAt).toBeDefined();
    expect(revokedLink?.revokedAt).toBeInstanceOf(Date);
    
    // Verify active link query returns nothing
    const noActiveLink = await db.query.shareLinks.findFirst({
      where: and(
        eq(shareLinks.videoId, videoId),
        isNull(shareLinks.revokedAt)
      ),
    });
    expect(noActiveLink).toBeUndefined();
    
    // Cleanup
    await cleanup();
  });
  
  /**
   * Test: Share analytics records with proper foreign keys
   * 
   * Validates: Requirements 19.3, 19.6
   */
  test("Share analytics records link correctly to share links", async () => {
    // Setup test data
    const userId = await createTestUser();
    const workspaceId = await createTestWorkspace(userId);
    const projectId = await createTestProject(workspaceId, userId);
    const videoId = await createTestVideo(projectId, workspaceId, userId);
    
    const token = crypto.randomUUID();
    const shareLinkId = nanoid();
    testIds.shareLinks.push(shareLinkId);
    
    // Insert share link
    await db.insert(shareLinks).values({
      id: shareLinkId,
      token,
      videoId,
      workspaceId,
    });
    
    // Insert analytics event
    const analyticsId = nanoid();
    testIds.shareAnalytics.push(analyticsId);
    
    const viewerHash = "test-viewer-hash-123";
    const [analyticsEvent] = await db.insert(shareAnalytics).values({
      id: analyticsId,
      shareLinkId,
      eventType: "view",
      viewerHash,
    }).returning();
    
    // Verify analytics event
    expect(analyticsEvent).toBeDefined();
    expect(analyticsEvent.shareLinkId).toBe(shareLinkId);
    expect(analyticsEvent.eventType).toBe("view");
    expect(analyticsEvent.viewerHash).toBe(viewerHash);
    expect(analyticsEvent.clipId).toBeNull(); // Null for view events
    
    // Query analytics by share link
    const events = await db.query.shareAnalytics.findMany({
      where: eq(shareAnalytics.shareLinkId, shareLinkId),
    });
    
    expect(events.length).toBe(1);
    expect(events[0].id).toBe(analyticsId);
    
    // Cleanup
    await cleanup();
  });
  
  /**
   * Test: Token uniqueness constraint
   * 
   * Validates: Requirements 19.2
   */
  test("Share link tokens must be unique", async () => {
    // Setup test data
    const userId = await createTestUser();
    const workspaceId = await createTestWorkspace(userId);
    const projectId = await createTestProject(workspaceId, userId);
    const videoId1 = await createTestVideo(projectId, workspaceId, userId);
    const videoId2 = await createTestVideo(projectId, workspaceId, userId);
    
    const token = crypto.randomUUID();
    const shareLinkId1 = nanoid();
    testIds.shareLinks.push(shareLinkId1);
    
    // Insert first share link
    await db.insert(shareLinks).values({
      id: shareLinkId1,
      token,
      videoId: videoId1,
      workspaceId,
    });
    
    // Try to insert second share link with same token
    const shareLinkId2 = nanoid();
    let errorOccurred = false;
    
    try {
      await db.insert(shareLinks).values({
        id: shareLinkId2,
        token, // Same token - should fail
        videoId: videoId2,
        workspaceId,
      });
    } catch (error) {
      errorOccurred = true;
      // Expect unique constraint violation
      expect(error).toBeDefined();
    }
    
    expect(errorOccurred).toBe(true);
    
    // Cleanup
    await cleanup();
  });
  
  /**
   * Test: Cascade deletion when video is deleted
   * 
   * Validates: Requirements 19.1
   */
  test("Share links cascade delete when video is deleted", async () => {
    // Setup test data
    const userId = await createTestUser();
    const workspaceId = await createTestWorkspace(userId);
    const projectId = await createTestProject(workspaceId, userId);
    const videoId = await createTestVideo(projectId, workspaceId, userId);
    
    const token = crypto.randomUUID();
    const shareLinkId = nanoid();
    testIds.shareLinks.push(shareLinkId);
    
    // Insert share link
    await db.insert(shareLinks).values({
      id: shareLinkId,
      token,
      videoId,
      workspaceId,
    });
    
    // Verify share link exists
    const linkBefore = await db.query.shareLinks.findFirst({
      where: eq(shareLinks.id, shareLinkId),
    });
    expect(linkBefore).toBeDefined();
    
    // Delete video
    await db.delete(video).where(eq(video.id, videoId));
    testIds.videos = testIds.videos.filter(id => id !== videoId);
    
    // Verify share link was cascade deleted
    const linkAfter = await db.query.shareLinks.findFirst({
      where: eq(shareLinks.id, shareLinkId),
    });
    expect(linkAfter).toBeUndefined();
    
    // Remove from cleanup list since it's already deleted
    testIds.shareLinks = testIds.shareLinks.filter(id => id !== shareLinkId);
    
    // Cleanup remaining
    await cleanup();
  });
  
  /**
   * Test: Analytics events support both view and download types
   * 
   * Validates: Requirements 19.3
   */
  test("Share analytics supports view and download event types", async () => {
    // Setup test data
    const userId = await createTestUser();
    const workspaceId = await createTestWorkspace(userId);
    const projectId = await createTestProject(workspaceId, userId);
    const videoId = await createTestVideo(projectId, workspaceId, userId);
    
    const token = crypto.randomUUID();
    const shareLinkId = nanoid();
    testIds.shareLinks.push(shareLinkId);
    
    // Insert share link
    await db.insert(shareLinks).values({
      id: shareLinkId,
      token,
      videoId,
      workspaceId,
    });
    
    // Insert view event
    const viewEventId = nanoid();
    testIds.shareAnalytics.push(viewEventId);
    
    await db.insert(shareAnalytics).values({
      id: viewEventId,
      shareLinkId,
      eventType: "view",
      viewerHash: "viewer-hash-1",
    });
    
    // Insert download event
    const downloadEventId = nanoid();
    testIds.shareAnalytics.push(downloadEventId);
    
    await db.insert(shareAnalytics).values({
      id: downloadEventId,
      shareLinkId,
      eventType: "download",
      viewerHash: "viewer-hash-2",
      clipId: null, // Can be null or a valid clip ID
    });
    
    // Query events
    const viewEvents = await db.query.shareAnalytics.findMany({
      where: and(
        eq(shareAnalytics.shareLinkId, shareLinkId),
        eq(shareAnalytics.eventType, "view")
      ),
    });
    
    const downloadEvents = await db.query.shareAnalytics.findMany({
      where: and(
        eq(shareAnalytics.shareLinkId, shareLinkId),
        eq(shareAnalytics.eventType, "download")
      ),
    });
    
    expect(viewEvents.length).toBe(1);
    expect(downloadEvents.length).toBe(1);
    expect(viewEvents[0].eventType).toBe("view");
    expect(downloadEvents[0].eventType).toBe("download");
    
    // Cleanup
    await cleanup();
  });
});
